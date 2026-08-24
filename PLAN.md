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

- [x] **M4.8 — the numbers, the wait, and four monsters breathing in
      lockstep.** Three loose ends, and each was the oldest thing left in its
      own corner of the game.

      **Floating combat text was the last of the 2D client still on screen.**
      One CSS class, one keyframe animation, a colour per call, projected once
      at spawn and then left to slide up the screen while the world moved out
      from under it. Rebuilt as a per-frame system (`floaters.ts`), because all
      three of its problems come from being fire-and-forget:
      - **It is anchored now.** A number over a monster belongs to that monster,
        and it is re-projected from that body every frame. Two steps sideways
        used to leave damage numbers hanging over empty grass
      - **Size carries the hit's weight relative to what it hit.** Damage over
        the victim's maximum health, curved by a square root: ten damage is a
        third of a slime and a rounding error on a dragon, and a flat number in
        a flat size claims those are the same event. This is the part that is a
        design idea rather than a paint job
      - **A volley no longer stacks.** Floats on one anchor fan out to
        alternating sides, lift by index, and are staggered 55ms apart, so a
        cleave into a pack reads as a sweep of five hits instead of as one
        number that happens to be thicker. Cleared and re-fanned per anchor, so
        the count is per body rather than global
      - **Six treatments, and the split is by direction rather than by school.**
        Warm white is your weapon, blue is your spells, red is what is being
        done to you, green heals, gold is XP, and a miss is small grey italic.
        Mid-fight the question is "am I winning", and colour answers it before
        the digits are read. Crits are gold in both directions, larger, glowing,
        with a small letterspaced CRIT above the number and a harder spawn punch
      - **Text about YOU always drifts left.** The player is centre screen and
        whatever is hitting them is a metre away, so the two anchors produce two
        columns of numbers in the same place. Giving "what you are taking" a
        lane of its own separates it by position as well as by colour
      - Capped at 26 live, pooled, and cleared on death so numbers do not
        outlive the fight and drift over the respawn. XP gained now floats too —
        it used to move a bar in the corner and nothing else

      **The first load has a screen, and it is shorter.** ~50 models and 22MB of
      texture behind a blank page, which on a cold cache reads as "it is broken".
      - **The number is produced by the loader, not guessed.** `assets.ts` counts
        what it is actually fetching and publishes it; a hardcoded asset count
        goes stale the first time a model is added and cannot know about the
        textures each model drags in behind it. The consequence is that the
        total GROWS during the load, so the bar is held monotonic in the view
        rather than in the data
      - The terrain's six Poly Haven maps are the heaviest download in the game
        and are fetched by `terrain.ts` off its own loader, so there is a
        `trackLoad` hook for fetches this module does not own. Without it the
        bar filled while the biggest files were still on the wire
      - **`whenLoadsSettle` waits for textures, not just models.** A model
        resolves when it has parsed; its texture is requested during dressing
        and is awaited by nothing, so the screen would otherwise lift onto a
        world that repaints itself twenty megabytes at a time
      - **The three halves of start-up now run at once.** Decor, the character
        rig and the socket were a queue, and none depends on the others — the
        same mistake the smithy's six props made inside one loop in M4.5, one
        level up. Connecting first matters most: measured, the socket is open at
        +109ms and the last asset request goes out at +654ms, so the character
        row and the first snapshot arrive while the models download. The screen
        lifts onto a world with 32 monsters already in it
      - Raced against a 25s ceiling, because a fetch that never settles would
        otherwise mean a loading screen that never lifts
      - The line under the bar says which part of the world is being built —
        "raising the treeline", "waking the camps" — rather than
        `nature/Pebble_Square_2.gltf`. The exact filename is on
        `__wieldboundLoad`, which is what a stuck load actually needs

      **A camp of four mushnubs was one animation played four times.** Every
      actor now carries a variance seed hashed from its server id, so every
      client sees the same camp:
      - The idle clip starts at `seed * duration` and runs at 0.9-1.1x. Set on
        every entry into idle rather than once at load, because an actor returns
        to idle constantly and a phase applied at load is lost the first time it
        moves. Run is rate-varied but NOT phase-offset — a pack chasing you is
        supposed to move together
      - **Idle monsters look around.** Nothing else in the game turns an actor
        that is standing still (facing is only written when something moves), so
        an undisturbed camp held its spawn heading forever. A slow head-turn
        every few seconds, on a seeded interval, easing at 2.4 rad/s instead of
        the 14 that combat uses — one rate for both made an idle creature snap
        round like a turret
      - **Monsters only.** A player's facing decides which way a skill fired
        into empty air goes, so a character that turned on its own while its
        owner read a panel would aim somewhere they did not choose

      Verified with 44 checks across three new headless suites. The floaters one
      measures the six colours apart, a heavy hit against a scratch (17px vs
      32.8px), a crit against a plain hit of the same weight, five simultaneous
      hits spanning 110-148px rather than one point, and a float moving 700+px
      when only the camera moves. The idle one reads the real mixer: eight
      slimes at phases 0.05 to 0.90 of the same clip, eight different rates all
      inside 0.88-1.12, facings that change on their own and not together, and
      the player's facing unmoved after nine seconds. The loading one drives a
      cold context and asserts the bar advances, never retreats, names a phase
      rather than a filename, and that the world is standing when it lifts.

      **Two harness lessons, both about measuring a thing that expires.** A
      float lives 1150ms and a `page.evaluate` round trip under SwiftShader can
      take longer than that, so anything spawned in one call and measured in the
      next is measuring the reaper. And polling the loading bar from outside
      returns nothing but its final state, because the main thread is saturated
      parsing models and every evaluate queues behind that — the trace has to be
      recorded inside the page.

- [ ] **M4.9 — remaining polish**

## Phase 48 — Items
The whole item system, replaced. User brief: delete every item in the game, add
a lot of new ones, each with its own model, rarity, stats — and a whole new
crafting system to go with them.

- [x] **M1 — the catalogue, the ladder and the smithy.** Three changes, and the
      first one is the one everything else hangs off.

      **ITEMS HAVE NAMES NOW.** A drop used to be a slot and a rarity — "a rare
      weapon (sword)" — generated from nothing, identical to every other rare
      sword, with two numbers rolled off a table keyed by nothing but where it
      landed. That is defensible while a game has three tiers and no art budget,
      and it stops being defensible when the thing in your hand is drawn in 3D
      and the premise of the game is that what you hold is who you are.
      `shared/items.ts` is a catalogue of **78 base items**; an instance is a
      base plus what happened to it.
      - Three axes, deliberately independent, which is the paperdoll's own
        argument one level up: **mesh** says what shape it is, **palette** what
        it is made of, **rarity** only tints and multiplies. Multiplying them is
        what turns 23 downloaded models into a catalogue — the same greatsword
        mesh is Steel, Frost and Dread and none of them needed an artist
      - **The numbers are derived, not authored.** A base declares its band and,
        where it is unusual, a multiplier; `basePower`/`baseGuard` compute the
        rest. A hundred and fifty hand-typed numbers is a hundred and fifty that
        drift, and no reviewer can tell whether band 3 beats band 2 by reading
        them
      - **Per-item weapon tuning** on top of the family's, which is what stops
        nine swords being one sword with different pictures: a claymore is slow
        and heavy, a falchion quick and light, a spear reaches
      - **Affixes reuse `PassiveBonus`** — the same bag the talent trees already
        total — so they need no new plumbing anywhere. `passivesOf` on the
        server adds gear affixes beside talent totals, and damage, accuracy,
        armour, mana and cooldowns all pick them up without learning gear exists

      **SEVEN QUALITIES, AND THEY ARE CONDITIONS RATHER THAN COLOURS.** Broken,
      Worn, Honed, Tempered, Forged, Runed, Enchanted. common/rare/epic was a
      colour ladder borrowed from every other game and said nothing about this
      one, whose single fixed landmark is a forge.
      - **Broken is BELOW baseline** — it multiplies numbers down. That makes
        the bottom of the ladder a real state with a real answer rather than a
        synonym for "common"
      - **Honed is exactly 1.0**, so the catalogue is authored at true values
      - Quality also decides the affix budget, 0 through 3

      **THE SMITHY HAS THREE VERBS.** Crafting used to be one: pick a slot, pick
      a tier, pay, receive an anonymous item — a way of buying loot rolls.
      - **Forge** — make a named thing. You choose WHAT; output is always Honed,
        because the forge decides what a thing is and the ladder decides how
        good. Gated by character level, not weapon level, since gating it behind
        weapon level would punish the weapon-swapping the game is named for
      - **Reforge** — one step up the ladder, re-rolled from the base at the new
        quality rather than added to. Keeping the old affixes and appending
        would make every investment decision "whichever you found first"
      - **Salvage** — break it down. Replaces selling for wood, which was a sink
        with no decision in it, and is what Broken items are FOR
      - **A fourth material, essence**, off kills rather than out of the ground,
        needed only by the top of the ladder — so the strongest gear in the game
        cannot be made by whoever stood at a tree longest

      **The art.** `tools/art/weapons.mjs` fetches Quaternius's CC0 Medieval
      Weapons (23 models, one zip, served directly by OpenGameArt — reproducible
      from a script unlike the monsters pack). Same stylisation as everything
      else in the world, and crucially **no textures**: flat named materials
      that map onto the game's material roles, which is what makes palette a
      real axis rather than a hue slider.
      - **The grip is still harvested, never authored.** The donor sword is
        loaded once and every model is FITTED INTO ITS GEOMETRY SPACE. Adding a
        weapon is a row and a file, with no grip constant anywhere
      - **An off-hand slot**, because the pack ships five shields and a shield is
        the one piece of gear whose value is obvious without reading a number.
        Two-handed weapons empty it, enforced in `db.equipItem` rather than in a
        message handler — it is a property of what is worn, so every future path
        that equips something obeys it
      - Two procedural shapes for the silhouettes no pack ships: a crystal stave
        and a quiver

      **Three bugs worth recording.** The fitter rotated every model a quarter
      turn on the assumption the pack authored things standing up in Y — true of
      the source files, false of what arrives, because FBXLoader has already
      converted to Z-up; so it measured the blade's WIDTH and every weapon came
      out twelve times too big. Then scaling by whatever axis ends up down the
      grip is right for a sword and wrong for a shield, whose thinnest axis
      points that way — a shield's 60-unit thickness normalised to a sword's
      length blew it up to five times the character. And `appearanceOf` on the
      server was a second, independent copy of `appearanceFromItems`: the moment
      the appearance grew a base id, that copy silently stopped carrying it and
      every remote player was drawn empty-handed. Latent since the shared
      function was written, and exactly the drift it exists to prevent.

      Verified: `tools/test/items.mjs` (78 bases, every model checked on disk,
      every icon, the ladder monotonic, 20k rolls reaching all 78 bases and all
      7 qualities, the forge/reforge/salvage economics); 25 checks in a real
      browser covering the catalogue, the bag, the tooltip, all three smithy
      tabs and a held mesh on the body; the smoke suite driving a real socket
      through forging one weapon per family, the two-handed rule emptying the
      off-hand, and salvage; and the preview contact sheets for every weapon,
      every off-hand and the seven-step ladder.

- [x] **M1.1 — weapons finally feel different, and the bag answers "is this
      better than mine?"** Two gaps in M1, and the first was a promise the data
      made that the game did not keep: thirty-seven weapons carried per-item
      range/speed/damage multipliers and nothing read them, so a Bloodclaim
      Claymore played exactly like an Arming Sword.
      - The FAMILY multipliers were being read inline at six call sites —
        `weaponDef(x).speedMultiplier` on the server, the same on the client's
        stat sheet, `attackRangeFor` reaching into the table itself. Adding a
        second factor to each would have been six edits nobody was reminded
        about, which is exactly how helm and cape once came to roll stats no
        combat formula read. One resolver per number instead — `reachOf`,
        `swingIntervalOf`, `hitBandOf` — and the server's swing timer and the
        character sheet cannot disagree about what a claymore does
      - The client's four reach call sites went the same way behind one
        accessor. A spear had been drawing a ring it could not hit to
      - **Measured across all 37 weapons, damage per second spans 1.6x** from
        the weakest to the strongest, which is tight enough that the choice
        between them is genuine rather than a ranking
      - The tooltip compares against what is worn in that slot, per number
        rather than as one verdict — "better" is not a fact when an item trades
        damage for speed — and says how a weapon SWINGS, read off the same
        multipliers combat resolves with so a rebalance cannot leave an item
        describing itself wrongly

- [x] **M1.2 — loot on the ground.** A kill put an item straight into the bag
      and a line in the combat log. That is the one moment an item system has
      the player's whole attention, and it was spending it on text — while the
      item's model, the thing the entire catalogue exists to show, went unseen
      until the bag was opened.
      - A drop is a real object now: **the item's own mesh** where the monster
        fell, turning, floating, on a disc of its quality's colour, with a beam
        for the top two qualities only. It reuses `buildHeldItem`, so the
        claymore on the grass is the same object you will be holding a second
        later and nothing in `drops.ts` knows how to build a weapon
      - **Things with no model get a pouch.** A ring is invisible and armour is
        a procedural shape authored against a body, so neither can lie on grass.
        `tools/art/props.mjs` pulls two more props out of the kit already in
        use, and **refuses any model that would need a fourth trim atlas** —
        which is what keeps "add a prop" free rather than two megabytes of
        texture
      - **Walk over it and it is yours.** Proximity, like gathering, combat and
        the workbench; a pick-up key would have been the only thing in the game
        that was not. Reserved for whoever the threat table credited with the
        kill — the same answer the experience split uses — then free, so a drop
        nobody wanted is not litter only one person can clear
      - A full bag now DELAYS a drop instead of destroying it, which is the
        honest behaviour and was impossible while loot went straight to the bag
      - Named plates in the item's quality colour, blips on the minimap in the
        same colour, and the name floating over your character on pickup. The
        corner toast is now reserved for the top two qualities: a line for every
        Worn dagger is noise, and noise is what stops a player reading the
        corner at all

- [x] **M1.3 — matched gear, and the catalogue grown to 107.** The catalogue
      keeps three independent axes and two of them meant something: mesh decided
      the shape, quality decided the numbers, and **palette decided nothing at
      all** — the one axis a player could SEE and had no reason to care about.
      - Wearing three pieces of one material is worth something now, five is
        worth more, and it is a choice a player can see on their own character
        rather than read off a sheet. That visibility is why it hangs off
        palette rather than a hidden set id: you can tell across a field whether
        someone is wearing a matched kit
      - **Twelve sets, named for what the material reads as** — Ironclad,
        Blackglass, Rimeward, Bloodwrought. A player guessing what obsidian
        rewards from its name should be right
      - Deliberately modest, and the test enforces it: a full matched kit is
        +10 armour and +9% damage, which loses to a mixed set one quality step
        higher. It is a tiebreaker with a look, never a second progression
      - Totalled into `gearPassives` beside affixes, so it reaches combat through
        the same funnel talents already use and needs no new plumbing anywhere
      - The sheet shows unreached tiers too, greyed: "three of five Blackglass"
        is only useful if you can see what the fifth would buy

      **The test refused eight of the twelve sets on the first run**, and it was
      right to: a five-piece bonus is not a bonus if the catalogue only has that
      material in two slots. So **29 base items were added** — every one the
      piece its kit was missing, since a Silver Circlet with nothing silver to
      wear under it was a promise the catalogue did not keep. 78 to 107, and
      "every palette a set is written for exists in at least five slots" is now
      a rule the suite checks rather than trusts.

      One systemic fix fell out of it: **band 1's budget went from 3 to 4**,
      because at 3 the lightest slots multiplied down to a primary of 1 — and a
      stat of 1 cannot get worse, which made Broken indistinguishable from Honed
      on those items and the bottom of the ladder meaningless for them. The
      floor of the system has to leave room for the system to move.

- [x] **M1.4 — a smith knows what they have taken apart.** The forge was gated
      by character level, which made it a shop: reach level 8 and a list of
      things you have never seen unlocks itself. That is a gate, not a craft,
      and it left the three verbs as three unrelated buttons.
      - **A recipe is learned by SALVAGING one.** Find a Frostbrand, break it
        down, and now you can make Frostbrands. The loop closes: exploration
        feeds salvage, salvage feeds the forge, the forge feeds the ladder — and
        "what do I do with a duplicate?" finally has an answer better than
        "delete it"
      - Band 1 is known from the start (21 of 107) so a new smith can make
        something on the first day. Everything else has to be taken apart
      - **Materials remain the real cost.** A level-1 character who somehow
        salvages a band-5 sword has learned something they cannot afford for a
        long time, which is a far more interesting position than a locked list
      - Locked rows are SHOWN, not hidden, with "salvage one to learn it" on
        them. A player who never sees a locked row never discovers the one rule
        the system has — and the list doubles as the closest thing the game has
        to a catalogue of its own items
      - Stored as rows keyed by (character, base), because that is the shape a
        wide column cannot hold; the absence of a row is the honest
        representation of "never seen one". Enforced on the server as well as
        greyed on the client, the same split `canLearnTalent` already makes

- [x] **M1.5 — the bench stops making you do arithmetic.** Two things the
      smithy asked of the player that it should have been doing itself.
      - **Reforge shows what a step up produces** before you pay for it: the new
        quality, the new primary, and how the affix count changes. The numbers
        are exact; the affixes are NOT previewed, because reforging re-rolls
        them — so it says how MANY there will be rather than pretending to know
        which. "Two affixes, re-rolled" is honest; showing the ones it has now
        is not. The suite reforges four hundred times and checks the preview
        sits inside what actually rolls
      - **One button clears the bottom of the ladder.** The bag holds thirty and
        loot is frequent, so salvaging Broken and Worn one confirmation at a
        time was a chore the game invented for itself. It stops at Worn on
        purpose: anything Honed or better is a real item and deserves a
        deliberate click, and a "salvage everything" button would eventually
        cost somebody an Enchanted
      - The client chooses which — it is the side that knows what the player was
        looking at — and the server re-validates every id, dropping bad entries
        rather than the whole request, because a partially-stale list is the
        normal case when a drop lands mid-click

- [x] **M1.6 — the forge previews too, and three things are felt rather than
      logged.** Finishing what M1.5 started: Reforge showed what a step would
      produce and Forge did not, which made the bench inconsistent about the one
      thing it is for.
      - Every forge row now says what it makes, in the same shape the reforge
        rows use. Trivial to compute — the forge always outputs Honed, and the
        catalogue is authored at Honed, so it is literally the base's numbers.
        That is the payoff for having chosen 1.0 as the baseline
      - **Essence floats over the character** when it drops. It is the one
        material with no gathering animation and no node to stand at — it simply
        appears off a kill — so it is the one that most needs saying
      - **Learning a recipe gets its own sound.** It is the moment the smithy's
        loop closes and it arrived as one line among several after a salvage; a
        player not reading the log never noticed that salvaging taught them
        anything
      - Both are guarded against the opening state, and the two guards are
        separate flags on purpose: the wallet and the recipe list arrive one
        after the other on connect, so borrowing one flag for the other would
        have congratulated a returning smith on everything they already knew

- [x] **M1.7 — loot that reflects what dropped it.** Loot was rolled from the
      band alone, so a dragon could hand you a plank shield and a slime could
      hand you dragonscale. The band is the right measure of how GOOD a drop is
      and says nothing at all about what it is — which made the catalogue feel
      like a table the world drew from rather than like things the world was
      made of.
      - **Affinity biases the material.** A golem carries iron and steel, a
        ghost bone and blackglass, a dragon crimson and gold. Bias and never
        restriction: anything in the band can still drop, so a camp is not a
        vending machine for one palette and the matched-gear sets stay
        assemblable by playing rather than by farming one spot
      - **Bosses have a signature** — the one item they are known for. Troll to
        Bulwark, golem to Deepsledge, dragon to Dragonscale Plate. It is the
        oldest hook in the genre, "I want that, so I am going to go and kill
        that", and the game had nothing like it. Measured at 39% of a dragon's
        drops: often enough to be a reason to go, rare enough that going is
        still a decision
      - Only bosses get one, or "the thing it is known for" stops meaning
        anything — a rule the suite checks against `guaranteedDrop` rather than
        against a second list

      **The test for this was wrong twice before it was right**, and the third
      version is the one worth keeping. "A kind drops its own materials more
      often than not" fails for any monster whose palettes are a tenth of its
      band. "Far more than chance" then fails for any monster whose palettes are
      already two thirds of its band, because a share cannot triple past 100%.
      The **odds ratio** against an unbiased roll of the same band is scale-free
      and is exactly what `AFFINITY_WEIGHT` sets — so the test asserts the knob
      rather than a symptom of it, and holds for all thirteen kinds.

- [x] **M1.8 — two things the player was working out by hand.**
      - **Bag slots mark straightforward upgrades.** Deliberately conservative,
        and it answers a DIFFERENT question from the tooltip's per-number
        comparison: the tooltip refuses to give a verdict because "better" is
        not a fact when an item trades damage for speed, so the mark fires only
        when there is nothing to trade off — every number at least equal and one
        of them ahead. A mark that appears on sidegrades is a mark players learn
        to ignore
      - It compares what the player actually GETS, never the band. The first
        version used `itemScore`, which adds the band for bag ordering — so a
        band-3 base with rolls identical to a band-1 one was marked an upgrade,
        which is a claim the numbers do not support since the two play the same
      - **The two-handed rule explains itself.** `equipItem` empties the
        off-hand silently, which from the player's side is a shield vanishing
        for no stated reason. The rule stays in the equipment where every path
        obeys it; the explanation is sent from the handler, because the
        explanation belongs to the person who was surprised

- [x] **M1.9 — cutting a rune.** The reforge ladder was a pure sink: pay more
      each step, re-roll, hope. Steep costs made it a decision about WHICH item
      to invest in, and nothing at all about what you wanted out of it.
      - **At Runed and Enchanted the player names one affix.** That is what
        makes the ladder's names mean something — a Runed item is one somebody
        cut the marks into deliberately, rather than one where the dice came up
        violet
      - Below that a reforge is still a re-roll, so the climb turns from a
        gamble into a decision. A ladder that is all gamble is a slot machine; a
        ladder that is all choice is a shopping list. It should be one and then
        the other
      - **Never a way past the rules.** The chosen affix has to be one the item
        could have rolled anyway — right slot, right band — and choosing one
        does not add a slot. Validated where the roll happens rather than at the
        message handler, so the forge, the loot table and the bench all obey it
        by construction
      - The selection survives the panel redrawing under it, which it does on
        every materials update. Losing a choice mid-decision is the kind of
        thing nobody reports and everybody notices

- [x] **M1.10 — the ground gets richer further out.** A balance problem the
      catalogue created and then made visible: every node paid exactly one,
      wherever it stood, while forge costs now reach 327 materials and the top
      reforge steps run into the thousands. Gathering was an order of magnitude
      behind the economy built on top of it.
      - **Yield scales with the band the node stands in** — 2 / 3 / 5 / 8 / 12 —
        using the monsters' own rings, so a player learns one geography rather
        than two. The one rule the world is laid out by, that walking further
        from the smithy IS the progression, was true of monsters and loot and
        not of the ground
      - **Five new node rings out at bands 4 and 5**, because nothing existed
        past 1560 and the economy has to be reachable from somewhere. 82 nodes
        now, spread 14/16/18/22/12 across the bands
      - The gather upgrade is a second axis rather than the same one twice: it
        adds on top of the band, and scales WITH the band, or it would be worth
        most in exactly the place it is easiest to use
      - **The plate says what a node is worth.** The rule is invisible otherwise
        — a player would have to gather at two distances and compare two numbers
        in a corner, and almost nobody does that
      - The suite now checks the economy is reachable at all: the dearest recipe
        is 327 materials against a band-4 gather of 14, so about two dozen
        gathers rather than a week of them

- [x] **M1.11 — the upgrade curves, repriced.** Both `gatherUpgradeCost` and
      `battlePowerUpgradeCost` were linear, written when a node paid exactly
      one. The moment the ground started paying two to twelve, level ten cost
      fifty-five wood — five gathers at the outer rings. A cost that grows more
      slowly than the income it is priced against is not a cost. Quadratic now,
      and the suite checks the ratio rather than the number: the gather upgrade
      runs from about four gathers early to forty-six late.

- [x] **M1.12 — the drop plate answers "is that worth walking to?"** Two marks
      on loot lying in the world, both reusing rules that already existed.
      - The same conservative **upgrade mark** the bag uses — nothing given up
        and something gained — because this is read at a distance where the
        tooltip cannot help, and a mark that appears on sidegrades is one
        players learn to ignore
      - **Reserved drops are dimmed**, not hidden. Knowing what fell is worth
        something even while somebody else has first claim on it, and the claim
        lapses in a moment anyway
      - `isUpgrade` moved no code: it lives in `ui/items.ts` because it decides
        whether to draw a mark, which is presentation rather than a rule

- [x] **M1.13 — where a stat comes from.** Four systems feed the Statistics tab
      now — the rolled numbers on gear, the affixes on that gear, matched sets,
      and the weapon's talents — and a single total cannot say which is doing
      the work, or which one would move if the player changed something. That is
      a gap the last few milestones created.
      - One line per source, listing only what it actually contributes. A source
        with nothing to say is left out rather than printed as a row of zeroes:
        a zero has to be read before it can be dismissed
      - **Recomputed from the same shared functions the server totals with**,
        never tracked alongside them. A second bookkeeping of where a number
        came from is a second thing that can disagree with the number
      - A bare character gets a line saying what would appear there, because an
        empty panel teaches nothing

- [x] **M1.14 — consumables become a table.** Two hardcoded constants and four
      bespoke message pairs, sitting beside a catalogue of 107 named things with
      a forge, a ladder and a salvage loop. The potion and the tonic were the
      last part of the item system that could not be extended by adding a row.
      - **`CONSUMABLES` in shared**, and one pair of messages for the whole
        table — `CRAFT_CONSUMABLE` and `USE_CONSUMABLE` — so adding one never
        adds a message, which is exactly what four bespoke pairs got wrong
      - Still **counters rather than instances**, deliberately: there is nothing
        to equip, nothing to roll and nothing to compare. A potion is a
        quantity, and giving it an id, a quality and two stat rolls would be
        ceremony
      - Two new ones, and **every effect is something the game already knew how
        to do**. That constraint is what kept this bounded: a consumable needing
        a new mechanic would be a new mechanic wearing a potion bottle. The Blue
        Draught restores mana; the Wrathful Philtre grants War Cry's own buff
        and is the one recipe that wants **essence**, because a buff is closer
        to gear than to groceries
      - **The healing cooldown became a GROUP.** It gated the potion by name; a
        second healing item would have walked straight past it, so "add a
        consumable" would quietly have been a way around the rule that stops a
        stocked player being unkillable
      - Stored as rows keyed by (character, id), and the two old columns were
        carried across once on the same schema-mark pattern the item wipe used —
        78 stacks moved on the first boot

- [x] **M2.1 — a bag slot holds a kind, not an instance.** Thirty flat cells was
      the right shape while the catalogue was three rarities of five slots. At a
      hundred and seven bases with a seven-step ladder on top, an evening at one
      camp fills the bag with six copies of the same Worn dirk — and each of them
      took a cell, so the bag reported itself full while showing the player six
      pictures of one thing.
      - **The kind is the item's NAME** — base, quality, affixes. Two things with
        the same name are interchangeable to whoever is carrying them, and the
        tenth of a point of jitter between their rolls is not worth a second
        cell. Anything that differs in a way the name shows — a Keen one, a
        Tempered one — stacks apart, which is the line a player would draw
        anyway and needs no separate rule
      - **The cap moved with it, onto cells.** Grouping the display while leaving
        the cap counting instances would have been worse than not grouping at
        all: the grid would show empty cells and the game would still refuse the
        drop. `bagRoomFor` is therefore asked with the incoming item rather than
        as a bare count — a seventh Worn dirk fits into a bag of thirty full
        cells and a Frostbrand does not
      - **Equipped items stopped counting**, which they always should have. The
        bag's own readout has excluded them since it was written, so the panel
        and the rule disagreed by up to seven whenever a character was dressed
      - A cell shows and equips the **best-rolled** of its pile, and says so in
        the tooltip; its salvage button breaks down the whole cell, which is safe
        precisely because a stack is homogeneous by construction
      - `STACK_LIMIT` is 9 and a bigger pile spills into a second cell, so "a
        cell is a slot" stays literally true and a bag is still something that
        fills up

      Verified: `tools/test/bag.mjs` (what shares a cell, how many cells a pile
      takes, whether one more fits, and that the grid the client draws and the
      cap the server counts are the same call), and in a real browser — 22 items
      seeded into a bag collapse to 6 cells reading "6 / 30 (22 items)", the
      nine-stack spills a two beside it, and the tooltip says which one the
      numbers belong to.

- [x] **M2.2 — a second material tier, and a fourth verb.** The reforge ladder
      priced its last step at 1,256 wood and ore — about ninety gathers for one
      click. Every number in that curve was defensible and its SHAPE was not: a
      cost payable only by repeating the cheapest activity in the game for an
      hour is not a decision, it is a wait, and it made the top of the ladder
      somewhere nobody went rather than somewhere hard to get to.
      - **REFINE is the fourth verb, and the only one whose output is not
        something you wear.** That is also the answer to "what does the smithy do
        that is not about items". Raw in, **ingots** and **wardweave** out
      - **Two refined materials, not one per gatherable**, because gear is made
        of two things: a hard part and the binding that holds it on. An ingot is
        the blade, the plate and the ring; a weave is the wrap, the lining and
        the cape. Every band-4 or -5 item wants both, in the ratio its slot
        leans — the same metal/soft split `forgeCost` already made — which is
        what stops half the bench being a button nobody presses
      - **Wood is in both recipes, and it is the fire.** Ore does not become an
        ingot without a forge burning under it, and it gives the cheapest and
        most abundant gatherable a job at the top of the game instead of leaving
        it as the thing you have four thousand of
      - **The raw line went linear and the refined line carries the curve.** The
        whole six-step climb of a band-5 weapon is now about what one of its old
        steps cost — 2,066 raw-equivalent, 109 gathers — and the top of it asks
        for a trip to the bench rather than another lap of the same trees
      - **Salvage never returns refined stock**, so every ingot spent on the
        ladder is spent for good. Refining is one-way, which is what makes the
        top of the ladder a commitment rather than a position you can back out
        of. The refine recipes take neither refined nor essence, so there is no
        laundering loop and no second essence gate
      - **Nothing below band 4 or ladder step 4 needs it.** A tier that reached
        the opening hour would be a tax rather than a gate
      - A batch button, because a hundred ore is three ingots; the server pays
        out until the wallet runs out rather than refusing the request, since a
        gather landing mid-click is enough to make the button's arithmetic stale

      **Two things stopped being written by hand.** The wallet's SQL is now
      generated from the shared `MATERIALS` list — four hand-typed statements
      naming the same four columns is four places a fifth material has to be
      remembered, and the failure is silent: a spend that forgets a column
      simply never charges for it. The client's wallet went the same way, from
      four fields to one record. `MATERIALS_UPDATE` stopped enumerating its keys
      for the same reason `CONSUMABLES_UPDATE` never did.

      Verified: `tools/test/items.mjs` section 9e (refined from raw only, never
      out of a salvage, wanted by both the forge and the ladder, the slot lean
      real, nothing below band 4 touched, and the whole climb measured in
      raw-equivalent so the tier cannot hide a cost rather than reduce it), and
      in a real browser — the fourth tab, six materials in the wallet and in the
      bag footer, one ingot costing exactly 30 ore and 18 wood, a batch of ten
      capped by the wallet and saying so, and a Tempered cloak's next step
      asking for 1 ingot and 2 wardweave while a Worn dirk's still steps up on
      raw alone.

- [x] **M2.3 — where a thing comes from.** Each of the three bosses has had a
      signature drop since M1.7 and it was in the data and nowhere on the screen:
      you could kill a dragon a dozen times and never learn that Dragonscale
      Plate was the thing it was known for, because the only way to find out was
      for it to happen. "I want that, so I am going to go and kill that" is the
      oldest hook in the genre and the game had it switched off.
      - **`dropSources` is the reverse of the affinity table.** That table
        answers "what does a golem drop"; nothing answered the question a player
        actually asks, which is the other way round. DERIVED from `MONSTER_LOOT`
        and the same band rule `rollBase` pools by — a hand-written "where to
        find it" column goes stale the first time an affinity is retuned, and
        the failure is silent: nothing throws when the game sends somebody after
        the wrong monster
      - **Three surfaces, two directions.** The target frame on a boss says
        *Known for Bulwark* (creature → item); the item tooltip and the forge
        rows say where one comes from (item → creature). The forge's LOCKED rows
        are the ones this changes most — they said only that you had never seen
        one, which is a rule rather than a lead, and the off-hand shelf now reads
        as somewhere to go
      - **Everything says something, and the fallback is the ring.**
        Twenty-two of the hundred and seven are made of a material no creature's
        affinity covers, and "nothing is known about this" is a worse answer than
        "the far corners" — which is true, useful, and the one rule the whole
        world is laid out by. Bands are spoken as distances from the anvil, never
        as numbers
      - **A signature is stated on its own** and never merged into the list of
        things that merely tend to carry it. "The troll's own" is a reason to go
        somewhere; "often carried by trolls and ghosts" is a shrug
      - Deliberately NOT on the nameplate. The frame requires selecting the
        thing, which is the walk-up-and-look gesture; a line over every boss in a
        camp is the clutter the nameplate hierarchy exists to avoid

      **The first version of the test was worthless and it is worth recording
      why.** It checked each claim by recomputing the index's own predicate, so
      it passed by construction and would have gone on passing on the day
      `rollBase` changed how it pools — which is the one failure this feature can
      have. It now rolls six thousand drops from each named creature and checks
      the item actually turns up: 181 claims, verified against the roller itself.
      Widening the band rule by one makes 51 of them fail, so it has teeth.

- [x] **M3 — etching: value that moves between items.** Quality was the only
      axis a player could invest in, and every step up it RE-ROLLS. So the
      affixes on a good item are entirely the dice's doing, and the moment you
      would rather wield something else, everything that made the old thing good
      is stranded — salvage hands back a third of its raw materials and nothing
      at all of what you actually cared about. A perfectly rolled Frostbrand was
      worth exactly the same in parts as a badly rolled one.
      - **DRAW** destroys an item and keeps ONE of its affixes as a rune —
        instead of its materials, and instead of its recipe. That makes a good
        drop a three-way decision (wear it, take it apart, take its rune out)
        rather than something you do to it on the way past. It sits under each
        salvage row rather than in a tab, because it is the same gesture asked
        for a different output and the trade should be visible
      - **ETCH** spends a rune to REPLACE one affix on something you own. Never
        to add one: quality still decides how many affixes an item has, so a
        Broken sword cannot be etched at all and the ladder stays worth climbing
        beside this rather than being replaced by it
      - **A choice is never a way past a rule.** A rune only goes where the item
        could have rolled it anyway — right slot, high enough band — the same
        sentence the chosen-reforge-affix check was written under, and validated
        on the server for the same reason
      - **Runes are counters, not instances**, the call consumables already
        made. There is nothing to roll and nothing to compare, and what a rune
        is worth is decided by the band of whatever it lands on rather than by
        where it came from — so a Tempest drawn off a band-5 sword is worth
        band-4 magnitudes on a band-4 helm, with no new rule needed
      - **An etched affix is indistinguishable from a rolled one.** Tracking
        which were cut in would make two copies of the same affix behave
        differently for a reason the player can see nowhere, and reforging would
        then have to explain itself twice
      - **What a rune fits is said at the moment of drawing**, not discovered
        afterwards at the bench. Drawing is irreversible and the band gate means
        a rune can come out unusable, which is the one way this verb wastes an
        item outright
      - The Etch tab is also **the only place in the game that says what an
        item's affix pool is** — when nothing you hold fits, it lists what would

      **One real bug, found by driving it.** The pickers fell back with `??`,
      so a select left holding the empty string counted as a choice and sent the
      server an affix nothing carried — which `drawRune` refused correctly and
      silently, leaving a button that did nothing. `||` for the fallback, and
      the server now says why it refused: every reason it can is a "should not
      happen" from the client's side, which is exactly why silence was the wrong
      answer.

      Verified: `tools/test/items.mjs` section 9f (the eligibility gate across
      all 25 affixes, no duplicates, never adds a slot, an etched affix reading
      identically to a rolled one, the cost curve rising with the target's band
      and staying under the top of the ladder), and in a real browser — five
      tabs, a rune drawn out of a Runed longsword and the item gone, the rune
      cut into a band-5 Venomkiss over the affix the player named, and a band-3
      longsword correctly refusing a band-4 rune with a list of what it would
      take instead.

- [x] **M3.1 — a cut rune survives the fire.** M3 shipped etching with a warning
      on it: reforging re-rolled every affix, etched or not, so cutting a rune
      before climbing the ladder destroyed it. The Etch tab said so, and a verb
      whose entire guidance is "do these two things in the other order" is a
      trap with a sign beside it. It also made the claim under the feature false
      — "the ladder decides how many, etching decides which" is not true of
      anything you intend to keep improving, because the next step un-decides it.
      - **A reforge now re-rolls what the DICE gave and keeps what was paid
        for.** The rule it had to fit inside rather than replace is the older
        one: a reforged item must not be a superset of itself, or every choice
        about which item to invest in collapses to "the first one you found".
        Rolled affixes are still entirely at the fire's mercy, and the test
        asserts that as hard as it asserts the other half
      - **The consequence is the best thing about it.** A player who has cut
        every slot on an item has bought their way OUT of the gamble, one rune
        and one measure of essence at a time. The ladder stays a re-roll for
        everyone who has not, so this is an investment that removes variance
        rather than a rule that removes it for free
      - **`etched` is a SUBSET claim, and subsets go stale.** A re-roll, an etch
        over an earlier etch, or a row written by an older build can all leave a
        mark behind an affix that is no longer there — and a stale mark reaching
        the roller is an instruction to preserve a slot the item does not have.
        So it is narrowed against `affixes` on the way out of the database, again
        in `survivingEtched`, and again after the roll. None of the three throws
        on its own; together they make the bad state unrepresentable downstream
      - **A keep list is not a way past a rule either** — the same sentence the
        chosen-reforge-affix check was written under. It is filtered by the same
        `eligibleAffixes` the roll uses and capped at the quality's own slot
        count, so preserving a rune can never become the slot-ADDING that etching
        was deliberately written not to do
      - **The one decision that was reversed, and why.** M3 recorded that an
        etched affix must be *indistinguishable* from a rolled one. That argument
        was about a difference the player could feel and could not see — and it
        still holds for everything it was about: two Tempests do exactly the same
        thing to a monster. What changed is that the fire now treats them
        differently, so the mark is stated wherever that matters — the tooltip,
        the reforge row by name, and the bag cell
      - **The bag cell had to move with it.** Etching does not change an item's
        NAME, so a paid-for sword and a plain one sat in the same cell — and a
        cell salvages its WHOLE pile, which M2.1 called safe "precisely because a
        stack is homogeneous by construction". It stopped being true the moment
        this landed, so `stackKeyOf` carries the marks and the etched cell is
        edged in violet

      Verified: `tools/test/items.mjs` section 9g — 400 reforges holding the rune
      against 34 that held it by luck when the preservation is removed, so a
      single sample would have passed by chance roughly one run in twelve. Plus a
      real browser: an Arming Sword forged, Keen cut over what it rolled, and the
      rune carried through Honed → Tempered (where nothing is left to the dice at
      all) → Forged (where a second affix rolls in beside it) → Runed, that last
      step by clicking the bench's own button rather than by sending a message.

- [x] **M4 — damage has a school.** Every blow in the game was one
      undifferentiated number. A firebolt and a warhammer both came out as "14",
      the only difference was which sprite played, and so the answer to every
      monster was the same weapon swung harder. The premise of this game is that
      what you are holding is who you are — and that premise was only half true,
      because the thing in your hand decided how you fought and never what you
      were good against. Frostbrand was a sword with a cold-coloured mesh.
      - **Six schools, and physical is one of them** rather than the absence of
        one. Making "no element" a real school is what lets a golem resist it; an
        untyped default would have to be the one thing nothing in the world could
        have an opinion about
      - **A weapon's school has two sources and a fixed precedence.** The FAMILY
        sets the floor — staves and wands are arcane because a staff already
        throws a bolt and neither has ever been a blow — and the MATERIAL
        overrides it. Only four of the twelve palettes are elemental, which is
        the ratio that keeps "elemental" from being the default. It is what the
        names have been promising since M1: Frostbrand deals frost, the Ember
        Wand burns, Venomkiss poisons
      - **NEVER IMMUNITY.** Fifty per cent either way, clamped on read as well as
        authored inside the cap, and a floor of 1 damage under all of it. The one
        rule the system has to obey is the game's own premise: you may pick up
        anything and go anywhere, so a profile makes a choice better or worse and
        never makes one unplayable. A wrong-school build kills a golem slowly
      - **Band 1 has no resistances at all.** The first ring is where a player
        learns that swinging works; a lesson about schools there is a lesson
        nobody has the vocabulary for yet
      - **Resistance applies before armour**, and the order is load-bearing:
        resistance scales with the size of the blow and armour does not, so
        subtracting armour first would make a resistance worth LESS against a
        heavily armoured thing, which is backwards. Armour still applies to every
        school — the tempting alternative, armour for physical and resistance for
        the rest, hands elemental damage a free pass around the one stat the
        whole game is already balanced against
      - **Monsters deal typed damage too**, so this is not a one-way conversation
        about offence. A dragon and a demon breathe fire, a ghost is arcane, a
        cactoro is nature — which is what gives the player's resistance something
        to be for. It comes from the four elemental matched sets at their
        five-piece tier and from one suffix per element, all band 3 and up: a
        resistance is situational, and situational is only a decision for someone
        who already has gear to choose between
      - **Five surfaces say it.** The target frame names what a creature is weak
        to and what it resists (weakness first — that is the actionable half);
        the item tooltip says what a weapon deals, and says so again when a swap
        would CHANGE it, because two weapons can roll identically and answer
        different creatures; the character sheet carries the school and all five
        resistances; floating damage takes the school's colour; and the log says
        "burned" and "it recoils" rather than "hit"

      **The test wrote four of the balance numbers.** The first run failed with
      nothing weak to physical, nothing weak to nature, and nothing resisting
      arcane or lightning — so the school twenty-five of thirty-six weapons deal
      had no camp where it excelled, and two elements were words in a tooltip.
      The bestiary was rewritten against those failures rather than the check
      being relaxed.

      **Known thin spot, deliberately left.** Lightning has one dealer in the
      whole game (Chain Lightning, a tier-3 staff talent) and no weapon at all,
      because no palette reads as storm and a new skill needs an icon, which
      means re-running the icon generator. The golem is still answerable —
      lightning is its bonus, not its toll — but a second source is the obvious
      next thing, and `tools/test/schools.mjs` prints the count every run.

      Verified: `tools/test/schools.mjs` — the cap, the vocabulary, that every
      element has something dealing it and something resisting it and something
      folding to it, that every boss has a reachable answer, and 4,000 rolls
      through the real resolver proving the numbers actually move. Sabotaged
      three ways to check it bites: skipping the resistance, authoring a 95, and
      swapping the armour/resistance order all fail it. Plus a real browser — a
      levelled character at the wolf camp swinging Frostbrand ("You chilled the
      Wolf for 17 — resisted", `school: frost, resisted: 30` on the wire) and
      then an Ember Wand ("You burned the Wolf for 4 — it feels that",
      `resisted: -30`) at the same creature.

- [x] **M4.1 — one table for every timed effect, and eight new skills.** The
      game had four timed effects and they were four hand-written versions of
      one idea: `playerBuffUntil`, `shieldUntil`, `weakenedUntil` and
      `monsterSlowUntil`, each with its own store, its own expiry branch and its
      own route into combat. The cost was not the duplication — it was that a
      fifth timed effect meant a fifth of all of those, and that every one of
      them was INVISIBLE. War Cry announced itself with a toast that faded in
      two seconds and then you hit 35% harder for another six with nothing on
      screen saying so; dying left you Weakened for twenty seconds and the log
      mentioned it once. "Why am I doing less damage" had no answer anywhere.
      - **A status is a row**: a name, whether it helps or hurts, a duration, and
        a bag of the SAME `PassiveBonus` modifiers talents, affixes and matched
        sets already speak. That is the whole trick — `passivesOf` folds them in,
        so a buff granting `damagePercent` reaches damage and nothing in the
        damage path had to learn that buffs exist. Two bespoke multiplications in
        the combat code were DELETED rather than reimplemented
      - **What could not be said in that vocabulary is deliberately narrow**, and
        three of the four extras are things the game already did: a movement
        multiplier (the old slow), a damage-taken multiplier (Shield Wall), and a
        repeating tick — which is the one new idea, and is what makes a debuff
        worth putting on something you are about to kill anyway
      - **Refresh, never stack.** A second cast extends rather than doubles, so a
        pile of slows cannot become a root and two marks cannot become a
        one-shot. Both multipliers are clamped on top of that, the same "never
        immunity" argument the resistance cap is written under
      - **A dot is real damage of its own school**, so a burn is reduced by fire
        resistance exactly as a firebolt is, and it credits whoever applied it —
        without that, a poison landing the killing blow hands the experience to
        nobody
      - **Eight new skills, one per weapon tree**, and that rule chose the list
        rather than a wish for particular effects. A status system half the game
        cannot use is half a system. Focus, Rally, Bloodlust, Stagger, Expose
        Weakness, Hunter's Mark, Immolate and Storm Bolt
      - **Storm Bolt closes M4's documented gap.** Lightning had one dealer in
        the whole game and no weapon at all, so a golem's only real weakness sat
        behind a single tier-3 node in a single tree
      - **`appliesSlow` became `applies: StatusId`.** Six skills set that boolean
        and every one meant something slightly different by it — two of them were
        never really slows. Rend opens a cut and Poison Arrow puts venom in the
        blood, and both had to be called a slow because a slow was the only thing
        the engine could do
      - **Monsters inflict too.** A cactoro poisons, a ghost chills, a demon and
        a dragon set you alight, a troll knocks your feet out — as a chance, and
        never below band 3. Without this half the player's own debuff row had
        exactly one thing it could ever show, and only after dying

      **The indicator was the point, and one signal is not enough.** Buffs sit
      left and debuffs right, always. A buff is round-shouldered and green; a
      debuff is hard-cornered, red, and NOTCHED at the top, so the silhouette
      differs with no colour at all — colour alone excludes anyone who cannot
      tell green from red, and position alone stops working the moment one side
      is empty. Time drains as a conic sweep rather than as digits, and only
      debuffs pulse in their last two seconds, because what you want to know
      about a debuff is when it stops. The same two-column arrangement appears
      on the target frame, so there is one thing to learn.

      **Two real bugs, both found by looking rather than by asserting.** The
      character sheet did not fold statuses into its totals, so Rallied gave you
      eight armour in a fight while the window went on reporting the number you
      had before you cast it — the exact disagreement the gear-aggregation
      helpers exist to make impossible. And the indicator row was positioned with
      a hand-picked pixel offset that put it underneath the target frame; every
      DOM assertion passed straight through it, because the markup was perfectly
      correct and invisible. It now publishes its own height into the same
      measured chain the unit frame already uses, and the suite asserts on
      rectangles.

      Verified: `tools/test/statuses.mjs` — the table, that buffs help and
      debuffs hurt, that every modifier key is one the stat sheet reads, that
      nothing composes into a root or an immunity, that every status has a source
      and every source can actually land it, and that every weapon tree got one.
      Sabotaged three ways to check it bites. Plus a real browser: Storm Bolt
      shocking a golem, Immolate burning it for 4 a tick against its 30% fire
      resistance, Rally moving the sheet's armour from 2 to 10, a cactoro
      poisoning the player back, and the rendered rectangles proving the row is
      somewhere you can see it.

- [x] **M4.2 — a front door.** The first thing anybody saw was a card with a
      heading, a name box and a paragraph explaining that there is no class to
      pick — and because the card had no width of its own it stretched to fit
      that paragraph: a thousand pixels across on a 1600px screen, with a 220px
      input floating at one end and a Play button running the whole span. The
      information was right and the page looked broken.
      - **The world renders behind it now.** The same terrain shader, the same
        ground cover, the same tree kit and the same forge that stands at the
        centre of the map, held at dusk and drifting. There is no artist on this
        project and never has been — every surface is procedural or CC0 — so a
        painted splash would be the one asset nothing here could produce or keep
        current. The renderer already knows how to draw this place, and the
        honest title screen is the place itself
      - **It SWAYS rather than orbits.** A full turn was the first version and it
        is the wrong shape: the composition is hand-made — card on the left
        third, forge on the right, smith lit from the front — and all three are
        true of exactly one arc. Turning all the way round means most of every
        visit is a framing nobody chose
      - **A smith stands at the anvil**, and the Warrior rig carries its own
        sword — so the figure is a warrior only because of what is in its hand.
        That is the game's whole premise, stated without any words. It is placed
        BEYOND the fire from the camera, which is the trick: with the forge
        between the two, the side facing the player is the side the fire is on.
        Standing it on the near side put a correctly-lit black cut-out in the
        middle of the frame
      - **Nothing about it is awaited.** The card is interactive on the first
        frame; ground and sky are synchronous, and cover, trees, the forge and
        the smith each arrive and fade in on their own. A failure in any one
        leaves a thinner scene rather than no scene, and the whole backdrop is
        constructed inside a try — a blocked WebGL context degrades to the flat
        gradient with every other behaviour identical
      - **The paragraph is gone**, replaced by four tiles showing each archetype
        and the weapons that make it. DERIVED from `WEAPONS` through
        `classForWeapon`, so a new family appears the moment it exists and the
        first screen of the game can never lie about how the game works
      - **A refusal says why.** The old button accepted a click on an empty
        field and simply did not start the game, which is indistinguishable from
        a broken page. And the last name is remembered — one name is one
        character here, so the name IS the account, and making somebody retype
        it every session is a password with no other purpose

      **The bug worth recording.** The renderer appends its canvas as the last
      child of `#login-root`, so with no explicit `z-index` it painted over
      everything: a beautiful lit field with the entire login behind it. Every
      DOM assertion in the suite passed straight through — the markup was
      correct and only the pixels were wrong. The check that catches it now is
      `elementFromPoint` over the card, which is a different kind of question
      from any other assertion in this project.

      Verified in a real browser: the card in the left third at 1600px and
      centred at 520px, the field focused before any of the scene has loaded,
      the card in front of the canvas, four tiles carrying [1,3,2,2] weapons
      straight out of the weapon table, a two-letter minimum that explains
      itself, the game starting, the backdrop giving its WebGL context back on
      the way in, the name remembered across a reload, and the whole thing still
      working with `getContext("webgl")` forced to return null.

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

## Phase 49 — Emberhold: a beginner town
User brief: *"build a small beginner town with a couple good looking buildings,
matching with our game style. Town should have some npc's — vendor, couple
quest givers, guide etc. Town should have proper lighting so the visibility
during night is also very good."* Then, mid-build: *"town should be bigger,
more space, bigger gaps between buildings — it's an MMORPG so a lot of new
players will be hanging out here, let's make it comfy."* Then: *"looks very
bland, barely any textures. There shouldn't be any materials like bush in the
town. We can also make a little town square in the middle. On that note let's
expand our world and push the monsters a bit further."*

The world had exactly one built thing in it — a smithy at the centre, which
also happened to be spawn, the origin of the difficulty bands and the only
landmark in 17 square kilometres of grass. Emberhold makes that centre a place.

**The place.** Six buildings on a ring at 560px, all facing inward, inside a
palisade at 800px with a road running gate to gate through the square: an inn
(The Bent Nail), a shop (The Ledger & Lamp), a stone-based watchpost with a
crenellated lookout and a banner, a chapel with a belfry and a spire, and two
cottages. Every one of them is GENERATED — boxes and gable prisms in the game's
own palette — because the CC0 kits this project draws on have props, plants and
characters but no buildings, and a downloaded building pack would arrive in a
different stylisation from the trees standing behind it. That is the same
mistake `World.buildDecor` was already fixed for once.

**Textures.** The first build was flat colour and the user's word for it was
"bland", correctly. Nine procedural canvas textures now — plaster, wood grain,
coursed masonry, thatch, shingle, slate, cloth, hammered iron, foliage — all
drawn near-white so they MULTIPLY the palette rather than carrying colour of
their own, which keeps the palette at the top of the file the one place a
colour is decided. The piece that makes them work is `boxProjectUVs`: a
BoxGeometry's own UVs run 0..1 on every face regardless of size, so one shared
map would appear at four metres a tile on a wall and eight centimetres on a
window frame. UVs are re-derived from world position, per triangle, on the
merged geometry — giving every surface in town the same texel density for one
pass at load.

**Five people, and each of them does something.** Elsbet Vane the Herald
explains the rules the game has never said out loud (six topics: the one rule,
where it is safe, how fighting works, what damage is made of, what to do
first). Oswyn Thale the Provisioner runs a real shop — nine lines, priced in
materials because there is no currency and is not getting one, everything
band 1–2, everything deliberately DEARER than forging the same thing. He is the
floor under a bad start, not a shortcut past the smithy. Warden Cabel and Marda
Quill give real quests. Tobin Ash at the anvil explains the bench's five verbs.

**Work.** Six quests, three each, counted server-side against events the server
already emits — a kill it already credited through the threat table, a gather it
already resolved, a forge it already paid for. No new tracking. Kill credit
follows the XP rule (everyone who damaged it) rather than the loot rule (top
contributor), because a shared quest that only advances for whoever landed the
killing blow is the exact defect Phase 42 fixed for experience. A tracker under
the minimap, hidden entirely when nothing is taken.

**Light.** Two separate jobs, deliberately kept separate. Lanterns and windows
are PLACES: twenty-odd point lights at doorways, on posts round the square, at
both gatehouses and around the monument, plus one shared window material whose
emissive is driven by the hour — they light up whether or not anybody is
watching, because that is what the town looks like from outside it. The ambient
lift is a CONCESSION: night in this game is genuinely dark and that is the
point, but a town nobody can read after dusk is a town nobody uses after dusk.
So the fill is scaled by the player's distance from the centre — comfortably
legible in the square at midnight, and back to the dark everything else is in
twenty units past the gate. Nobody carries the town's light out into the field.

**Walls that are walls.** The world had no static obstacle in it at all until
now — bodies collided, scenery did not, and nothing was solid enough for that
to be noticeable. `pushOutOfBuildings` in `shared/town.ts` slides a body out
along the SHALLOWEST axis of penetration, which is what makes a wall feel like
a wall rather than a magnet, and it runs after body collision so a monster that
shoves you into the inn leaves you standing outside it.

**The world grew by half in each direction** — 4800x3600 to 7200x5400, 2.25x
the ground — and every ring moved out with it. The town is 40 units across now
and everything radiating from it had been measured against a centre that used
to be a single prop: at the old radii a slime could aggro a player standing at
the anvil. Band 1 camps went 620 -> 720 -> 980 -> 1320 across three passes of
this phase alone. Resource bands, node rings, monster camps, the treeline count
and the ground-cover density all followed; the last two are now expressed as
densities rather than headcounts, so the next resize does not silently thin the
world out.

**Nothing gatherable inside the walls.** The herb ring spent one build in the
square, which was convenient and was also the only place in the game where a
resource node and a shopfront were the same scenery. A town is somewhere you go
BETWEEN gathering trips.

### What the tests refused
`tools/test/town.mjs` is pure geometry over the shared layout and it rejected
the town four times before it passed. The first attempt put seven buildings on
a 340px ring: three pairs overlapped and three of the four roads ran into a
wall, because a building's ANGULAR width grows as the ring shrinks and the
widest part of a footprint seen from the square is its front corners, not its
sides. Three more attempts followed before the road went from four spokes to
one through-road — two 156-degree arcs with three buildings each instead of
four 66-degree arcs with two — which is the change that made the arithmetic
work and is also the better town. It then caught a herb bush inside a wall, a
monster spawning at the palisade, and (via a rule added in the same pass) two
node rings that had been falling outside the world's short axis for several
phases with nothing saying so.

`tools/test/quests.mjs` refused nothing on its first run, but it is what pins
the two rules that make the shop and the quests honest: every shop line must
cost MORE in total than forging the same item, and quest rewards may not pay
essence, which is supposed to come only off kills.

### One real bug, found by accident
Deleting the database to test the new `quests` table would not start: the
one-time item wipe from Phase 48 M1 clears `weaponRarity`, `armorRarity` and
`bootsRarity`, and those three columns are ADDED by the migration loop that ran
AFTER it. On any database that had been through an older build the columns were
already there and the ordering never mattered — so the bug only ever appeared
on a genuinely fresh file, which is exactly the path the README documents and
the one nobody re-walks. The server threw `no such column: weaponRarity` and
never came up. Moved below the migrations.

### Verified
Headless Playwright against the real client and a real socket: five bodies
loaded, walking into the inn evicts you 121px, the Herald's dialogue opens and
answers a topic, walking away closes the box, Cabel's first quest is offered
and accepted, the tracker appears at 0/4, a slime killed in the field advances
it, Oswyn's stock lists with prices, lanterns read 0.00 at noon and 11.02 at
midnight, the ambient lift reads 0.68 in the square and 0.000 twenty units
outside the gate. Zero console errors. Plus all nine offline suites and both
workspaces typechecking clean.

### M49.1 — what the screenshots caught
All of it came from the user looking at the running game, and none of it would
have been caught by a test that did not already know to look.

**Things floating.** Two real ones. The woodpile went through `Builder.cyl`,
which raises a piece by half its HEIGHT — right for a post standing up, wrong
for a log lying down, so the logs hovered 0.55 units over a stack only 0.75
tall. And the kitchen-garden fences were rails and nothing else: two planks at
0.24 and 0.5 with no posts under them, which is exactly what a fence looks like
when you forget the posts. The bench's backrest was also standing up through
the middle of its own seat, offset along world Z instead of the bench's own.

**The forge in the middle.** It had been at `PLAYER_SPAWN` since Phase 16 and
that was right while it was the only object in the world — it WAS the landmark.
In a town it is one building among six, and sitting on the exact point every
player materialises on meant arriving inside the anvil. Moved 330px out on
bearing 140, with the monument, well and stall re-spaced onto opposed bearings
around the now-clear centre.

**Wildflowers through the paving.** The ground cover has been scattered over the
whole play area since M4.2, from before anything was built on it, so the town
arrived with grass growing out of its cobbles. `ScatterArea` takes an exclusion
circle now — excluded rather than hidden, because the plants stand proud of the
paving and a flat decal cannot cover something taller than itself.

### M49.2 — seeing your character, and not walking through the town
Two more from the same source, and both needed more than the obvious fix.

**"You still can't see them."** Third-person games have three answers to this —
move the camera, fade the obstacle, draw the character on top — and this now
does all three, in that order of preference, because none of them is sufficient
alone.

*Camera collision* is the primary: five rays cast from points spread over the
character (head, chest, knees, a shoulder either side) toward the camera, and
the camera pulled in to just in front of whatever they hit. Snapping in and
easing out — a wall arriving has to be answered on the same frame, a wall
leaving can be given half a second. The first version cast from `lookTarget`
alone and shipped a real bug: the look point is at chest height, so a camera
with clear sight of the chest still had a wall across the legs, and the browser
check caught the watchpost and the chapel doing exactly that.

*Fading the blocking building* is the second layer, for the case camera
collision cannot solve — a player flat against a wall puts it closer than any
camera can retreat past, and the diagnostic showed both failures bottoming out
at the minimum distance with the wall still 1.8 units away. Buildings joined the
treeline in `fadeOccluders`, which required giving each building its OWN
materials: the town shared one plaster material across all six, so fading what
blocked you would have faded the whole town.

*A silhouette on every actor* is the guarantee, and it is what the other two
cannot reach: the palisade, the market stall, the well and the monument are one
merged mesh each with no per-object handle to fade; other players and
townspeople are not what the camera is following; and a monster behind a tree is
nobody's line of sight but its own. Every actor now carries a second copy of its
meshes sharing the same geometry and the same skeleton, drawn with `depthFunc:
GreaterDepth` — so it draws ONLY where that actor is behind something already in
the depth buffer. Unoccluded it costs a draw call and no pixels; occluded it is
exactly the missing shape and nothing else. No per-frame bookkeeping, no list of
what might be in the way, and it covers everything in the world at once.

**"You shouldn't be able to pass through walls and similar objects."** The
buildings were the only solid things in town, so the palisade, the well, the
stall, the monument, the benches and the lamp posts were all scenery you strolled
through. Everything with a footprint is now a circle in `TOWN_PROPS`, and the
palisade is a ring you cross only at a gateway. The positions moved OUT of the
client's builder and into `shared/town.ts` in the same change — the client draws
the monument from that entry and the collision keeps you out of that entry, so
there is no second copy to go stale, and the failure mode being avoided is an
invisible wall in the middle of open paving.

One bug caught before it shipped, by a test written for it: the smithy as a
solid circle would have held every player further from the anvil than
`INTERACTION_RANGE_PX`. Its six props ring an empty middle and that empty middle
is where you stand to craft, so it is drawn but not solid — a distinction the
prop table now carries explicitly as `blockRadiusPx: 0`.

---

## Phase 50 — Storm, and skills that read a status
The two things Phase 48+ parked on purpose, taken off the shelf in the order
they unblock each other: the material first, then the sequencing.

### M50.1 — the thirteenth palette
`tools/test/schools.mjs` has printed `lightning 0 weapons, 2 skills` on every
run since damage got a school. It was the only element in the game that no
player could ever be HOLDING — two spells in two of the eight weapon trees, and
nothing else. That is a direct contradiction of the game's one rule: if what
you are holding decides what you are good against, then a school you cannot
hold is a school outside the premise.

**A palette, not a field.** The fix was never `school: "lightning"` on a weapon
row — that is the design the catalogue already rejected once, because a
hand-typed school is thirty-six chances for Frostbrand to be steel-coloured
frost damage. A weapon's school comes from its MATERIAL, so a lightning weapon
needs a lightning material, and there wasn't one. `storm` is the thirteenth
palette: dark blue-grey metal, near-black timber, a hot pale accent. It is also
the only palette in the file added the right way round — the element existed
first and had nothing made of it, rather than a colour being handed a job.

**Three weapons and five slots**, because a palette with a matched set is the
only kind that means anything (M1.3), and a five-piece bonus is not a bonus if
the material exists in two slots. Levinbrand (sword, band 4), Thunderhead
(mace, band 5) and Stormrod (wand, band 5) — one warrior family and one caster,
so the school is not a mage's private toy. Stormrod also fills a gap that had
nothing to do with lightning: the wand family had no band-5 entry at all, which
made it the one family whose top end was somebody else's weapon.

**Band 4 for the sword, deliberately.** The golem is the one creature with a
seam of lightning and it stands in band 5. An answer sold only at the same ring
as the question is not an answer.

**Where it comes from is the loop.** Storm is the golem's own material — the
creature with lightning for a seam is the thing you take lightning off. So the
counter to a golem is a thing you get by killing golems the slow way first,
which is the oldest good loop in the genre and it fell out of the affinity table
rather than being written into it.

**And the seam works both ways.** Every other creature with an element resists
what it deals: a demon is made of the fire it throws. The golem is now the
exception, on purpose — it throws lightning and folds to lightning, because the
seam is where the charge comes out AND where the stone gives. That is what makes
`resistLightning` a stat rather than a line in a set bonus with nothing to
answer: before this, five elements could be worn against and only four could
ever be thrown at you. Its slam also leaves you Shocked a quarter of the time,
which is the worst thing that can happen against the one creature with 14 armour.

**Stormbound** is the kit: attack speed and crit at three pieces, plus movement
and `resistLightning` at five. Quick, loud, gone before the thunder.

### What the tests refused, and what they now pin
Nothing failed on the first run, which is itself the finding: the catalogue,
the loot roller, the forge, the salvage ladder, the affix pool and the gear
renderer all absorbed a thirteenth material and eight new bases without a line
of code changing anywhere. That is what `PALETTES` being a table rather than a
switch statement bought, four phases ago.

Three rules were added to `schools.mjs` so the hole cannot reopen:

- **`something is MADE of <school>`** — the check the old
  `skills + weapons > 0` quietly let through for the life of the project. A
  spell is not enough: an element with only spells behind it is an element six
  weapon trees cannot reach.
- **every elemental material has a matched set, and that set wards against its
  own element** — otherwise the newest material is the one a player can see and
  has no reason to collect, which is the exact defect matched gear exists to fix.
- **anything a creature throws can be dressed against** — a monster with an
  element and no wearable answer is a stat check rather than a decision.

### One thing fixed on the way past
The typecheck did not work. `tsc -b` reported every `shared/*.ts` import in both
workspaces as TS5097, because `allowImportingTsExtensions` was never set — so
the one command that would catch a type regression printed ten errors on a clean
tree and was unreadable. Explicit `.ts` extensions are what let tsx, Vite and
`node --experimental-strip-types` all resolve the same source with no build step
between them, so the extensions stay and the flag was the missing half. The
server additionally needs `rewriteRelativeImportExtensions`, since it actually
emits. Both workspaces are clean now, which they had not been for some time.

### Verified
All nine offline suites, both workspaces typechecking clean, and headless
Playwright against the real client: the palette, the school mapping, the eight
storm bases across six slots, the Stormbound tiers, the golem's attack school
and its Shocked rider all read correctly out of the live bundle, and
`describeDropSources` says "often carried by golems" for both a band-4 and a
band-5 storm piece. The three weapons were rendered in the contact sheet and
read as their own material against steel, obsidian and frost. Zero console
errors.

### M50.2 — skills that read a status
Fourteen timed effects existed and every skill that touched one PUT it there.
Nothing in the game had ever asked whether one was already running — which is
the difference between a set of timers and something a player sequences. You
pressed Rend because Rend was off cooldown, never because of what it set up.

**A `reads` field, not a conditional in code.** `StatusRead` is four fields —
what to look for, where to look, what finding it multiplies, and whether to
spend it — and three shapes fall out of them, which happen to be the three the
genre has. A FINISHER reads a debuff and leaves it (Execute, against anything
already bleeding, burning or poisoned). A DETONATOR reads one and consumes it,
trading the rest of the effect for a burst now (Combust, Killshot, Follow
Through, Exploit). A CLEANSE reads a debuff on YOU and consumes it with no
bonus, which is the same machinery pointed at a different problem (Second
Breath, Ward Off).

Declarative for the same reason `applies` and `school` are: a conditional
written as code is a conditional the tooltip, the talent panel and the tests
cannot read. All three read it now, from one shared `describeRead`, so the
sentence under the node cannot drift from the number the server multiplies by.

**Families are named, not listed.** `group: "dot"` resolves against `STATUSES`
at read time rather than at table-build time, so a fifteenth status that ticks
becomes Execute-able the moment it exists. It also HAS to be that way round —
the skill table is defined above the status table in the file, and a derived
constant there would be read before it was written.

**One per weapon tree, again**, and this time the rule is load-bearing rather
than tidy: a sequencing mechanic two trees can play is a mechanic six weapons
watch. Each reader looks for something ITS OWN tree can produce, so the pair is
learnable inside one tree instead of requiring a second player — Rend then
Execute, Concuss then Follow Through, Hunter's Mark then Killshot, Immolate then
Combust. The two exceptions are the two trees with no debuff to read: the fist
tree has never had one and its answer to a debuff is to shake it off, and the
wand's is the same verb pointed outward at an ally.

**Onslaught is the odd one and the best one.** The sword tree is the one with no
debuff of its own and three buffs, so its reader looks inward: it spends
whatever is carrying you on a single blow. It is the only skill in the game that
consumes something GOOD, which is what makes it a decision rather than a bonus.

**Two rules the server enforces that the table cannot.** A self-read only fires
once there is something to swing at — a finisher that eats your War Cry on empty
air is a button nobody presses twice, and the hotbar has fired freely into
nothing since M3.6 precisely so that pressing a key is never punished. And a
cleanse resolves BEFORE the "already at full health" refusal, or the one moment
it is most wanted — poisoned, burning, and topped up by a potion — is the moment
it refuses to work.

**And the player can see it.** `empowered` is reported PER HIT rather than per
cast, because a detonator in a pack finds the condition on some of what it lands
on and not the rest. An empowered hit flashes amber instead of blue, its floater
carries a mark, and the log says which condition paid. A conditional that is
wired through every table and announced nowhere looks finished in a screenshot
and feels like a lucky roll.

### The hole this fell into
**You could not put a weapon down.** There is no unequip anywhere in the game
and there never has been: `equipItem` only ever equipped, no message meant "take
this off", and the paperdoll was decorative. Which quietly meant that from the
moment a character picked up their first weapon, the entire fist tree — ten
nodes, four skills, and the archetype `classForWeapon` calls "a real (if weak)
one rather than a broken state" — was unreachable for the rest of that
character's life.

It had been true since Phase 45 and nothing noticed, because nothing had ever
needed to go back. Testing Second Breath needed to. `EQUIP_ITEM` on the item
already worn now takes it off — a toggle rather than a second message, since the
slot holds one thing and "equip what is equipped" had no other meaning to take —
and a filled slot on the paperdoll is a button that does it.

### What the tests refused
`tools/test/statuses.mjs` grew a ninth section, and it is written against the
ways a read can be silently wrong rather than against the code that resolves
one: a condition nothing in the world can apply is a permanent miss; a condition
a tree cannot produce is a skill that only works with company; a consuming read
with no bonus and no cleanse behind it is a button that makes you worse; and a
read with no tooltip sentence is a conditional the player will not play around.
It also pins the resolver itself — soonest-expiring first, group coverage, and
that a cleanse can lift Weakened and cannot lift a buff.

The browser suite refused three things, and all three were the harness rather
than the game, which is worth writing down because each looked exactly like a
product bug for a run:

- **Everything died before it could be read.** A seeded test character kills
  anything in band 1 with one cast, so the debuff it had just applied was
  sitting on a corpse. Six checks failed. Everything is fought against a golem
  now: 240 hit points, 14 armour, 30% physical resistance, and it stays standing.
- **Execute could not be tested in the obvious order.** Its cooldown is nine
  seconds and Bleeding lasts eight, so applying the bleed first means it has
  expired by the time the skill comes back up — which reads as "not empowered".
  Wait out the cooldown, then cut, then swing.
- **A ground-targeted detonator with nothing selected lands on your own feet.**
  A golem that chases past its leash turns round and runs home, and Combust then
  hit nothing at all. That one is arguably a design question rather than a bug —
  firing into empty air is deliberate (M3.6) — but it is worth knowing that a
  radius skill answers "out of range" by bursting where you stand.

### Verified
All nine offline suites, both workspaces typechecking clean, and a socket-level
run against the real server covering every shape: Execute empowered against a
bleeding golem and NOT against a clean one, hitting 81 against 41 and leaving
the bleed running; Killshot reporting `consumed: "marked"` with the mark gone
afterwards; Onslaught firing into empty air WITHOUT eating the buff and then
spending it on the golem; Combust spending a burn through a radius; Second
Breath lifting exactly one thing and refusing with a reason that mentions the
lift rather than only the health. Plus a headless browser pass: the condition
line renders under Execute, Onslaught and Combust in three different trees,
clicking the weapon slot on the paperdoll takes the axe off and the class label
goes back to Adventurer, and zero console errors.

---

## Phase 51 — Emberhold, dressed (and a skeleton exorcised)
User brief, in three parts: *"Why do all the characters now have some sort of a
skeleton on their models? it looks very bad."* Then: *"Lets also enchance and
improve our visuals. Add more textures and details to town, lets make it look
real good and comfy since its gonna make first impression on new players."*
Then, with a screenshot of the obelisk: *"also remove this thing. you can add
some sort of a very good looking statue model as a respawn point in the middle
of town square."*

### The skeleton
Every character in the game — players, townspeople, everyone — was wearing pale
blue-white struts across the torso, forearms and shins. In the open. At noon.
With nothing in front of them.

It was M49.2's through-walls silhouette, and the diagnosis is one word: WHICH.
"Draws only where this actor is behind something already in the depth buffer"
was the right idea, and "already in the depth buffer" was supposed to mean the
world. It meant the actor's own gear. The silhouette was `transparent`, three.js
draws every transparent object after every opaque one, and so by the time it ran
the shoulder plates, bracers and shin guards it belongs to had all written
depth. The body sits about a centimetre behind its own armour, so it passed
`GreaterDepth` underneath every piece of it. It traced the gear, which is
exactly why it read as bones.

**Fixed by ordering, not by a depth bias.** The tempting one-liner is
`polygonOffset`, and it is wrong: the body-to-gear gap is a centimetre and the
body-to-wall gap is half a metre, but both are non-linear in the depth buffer
and both move as the camera zooms, so any bias tuned at one distance is wrong at
another. Instead the silhouette became OPAQUE and slots between the two groups
by render order — world at 0, silhouettes at 1, everything any actor owns at 2,
set in `trackMesh`, which is the single choke point body meshes, held items and
worn armour all pass through. A silhouette now tests against a depth buffer
holding the world and nothing else, which is precisely the question it means to
ask.

Two consequences, both taken on purpose and both written down at the constant.
It is solid rather than 42% translucent, because the opaque pass is what gives
it the right depth buffer and three.js picks the pass off `material.transparent`
— and a solid shape through a wall is the conventional read anyway. And an actor
behind another ACTOR no longer silhouettes, since all bodies now draw after all
silhouettes; that was never one of the three cases the feature exists for, which
are all actor-behind-scenery.

Verified both directions, because half a fix here looks exactly like a whole
one: the bones are gone standing on open paving, and walking out through a solid
stretch of palisade still shows the legs through the timber and nothing else.

### The statue
The obelisk was four grey boxes and a cone, and it stood off to one side. Both
halves of that were wrong, and the second explains the first: the middle of the
square was where every player materialised, so anything standing on it was
something they arrived inside, so the best spot in town was reserved for nobody
to stand on — and a monument that is not on the centre is not the centre of
anything.

**`PLAYER_SPAWN` and arrival are two different things now**, which they always
should have been. Spawn is the ORIGIN: every difficulty band, every camp, every
node ring and the town itself are measured from it, so it cannot move without
moving the world. Arrival is a PLACE. `PLAYER_ARRIVAL` puts it 150px out on
bearing 60 — clear of the statue, on open paving, facing back across the square
— and the server uses it for new characters and for every respawn. One constant,
and the centre is free.

**The figure is the game's own Warrior rig, cast in stone.** This project has no
sculptor, and every human built out of the box kit lands somewhere between a
snowman and a scarecrow; the obelisk existed because a figure was out of reach.
But the game already ships people, in exactly the stylisation of everything
round the square, and a statue is only a person who has stopped moving and
turned the colour of rock. So: instantiate the rig, hold one frame of its own
animation, repaint every surface in the town's stone. It is the one object in
Emberhold that is loaded rather than generated, and the exception is the point —
everything else is boxes because a downloaded BUILDING would arrive in a foreign
stylisation, and a person is the opposite case.

Posed by sampling a clip rather than left in bind pose, which is a T. Chosen by
clip NAME after the first version matched `/attack|slash|swing/i` and found
`RecieveHit_Attacking` several entries before `Sword_Attack` — a stone man
flinching, which looked like a bad model and was a bad regex. `Idle_Weapon`
wins: a swing frozen mid-air reads as a person who has been paused, and a figure
standing squarely with the sword down reads as something somebody carved. It
also has no root motion, so the feet stay over the middle of the plinth.

The road now passes either side of it on a radial flagstone island, so the
layout test's road rule became a CORRIDOR rather than a centreline — the honest
question is whether you can get from gate to gate, not whether you can do it
without ever stepping off the axis. The half-width is shared with the client, so
the road a player can see and the road the test walks are one number.

### The seam that was a plank
Found while looking at the town for the dressing pass: a dead straight line
across the whole square, day and night, darker on the near side. It survived
shadows off, lights off and a bare-terrain test, so it looked like a renderer
bug for three rounds of diagnosis.

It was the road. One 58-unit plane laid under the plaza on the assumption that
the paving covered it, with a hard alpha edge along its far side that this
camera's foreshortening stretched right across the frame. The road is two
segments now, stopping at the paving — which makes the comment that was already
sitting above it ("where it crosses the square it is paved") literally true
rather than aspirational.

Worth recording as a method note: the thing that cracked it was hiding one mesh
at a time rather than reasoning about it. Three plausible physical explanations
survived every amount of thinking and none of them was right.

### The dressing
Emberhold's first pass got the architecture right and left the place empty. Six
good buildings round twenty-seven units of bare cobble is a car park with nice
sheds on it, and the square is the first thing a new player stands in.

The whole square read BROWN, which is the diagnosis: plaster, timber, thatch,
cobble and grass are four browns and a green, and the only saturated thing in
town was one awning. So the additions are the cheap bright things a real village
puts out precisely because they are cheap and bright:

- **Bunting**, slung post to post right round the lantern ring, on a sagging
  curve rather than a straight line — a straight one reads as a washing line
  drawn in a level editor. The two spans that would cross a gateway are skipped,
  because bunting over the road is bunting a cart takes down. It is the single
  biggest change to how the place feels: an open plaza with flags across it
  reads as somewhere that holds a market.
- **Window boxes** under every upper window on every front. The cheapest colour
  in the town and the one that does the most work, because it is the only
  saturated thing at the height a player actually looks — everything else is
  overhead or underfoot.
- **Planters** either side of every bench, **a handcart** tipped onto its
  shafts, **a notice board** with papers pinned to it, and **two braziers**
  whose coals are a real light after dark and a warm spot of colour at noon.

Blooms are deliberately larger than a real flower head: at this camera a
botanically honest one is two pixels and reads as noise on the texture. It has
to be legible from across the square or it is not colour, it is dither.

**Every one of them is solid**, and every position lives in `shared/town.ts`
rather than in the client's builder — the rule the well and the monument were
already moved onto in M49.2. The client draws each from that entry and the
collision keeps a body out of that entry, so there is no second copy to go
stale, and the failure being avoided is a handcart you walk straight through.
Nineteen new solid props; `tools/test/town.mjs` still finds both roads passable,
every townsperson reachable and the anvil stood at.

### Verified
All nine offline suites, both workspaces typechecking clean, and a headless tour
of the square, the smithy, the inn, the chapel, the watchpost, a gate, dusk and
midnight — zero console errors at every one. Plus the two silhouette checks
described above, and the before/after pair on the seam.

### Three things the user caught after the pass
All from looking at the running game, and all of them the same shape: something
that was dimensionally honest and read wrong.

**"What are these terrible transitions between roads?"** Cutting the road at the
paving fixed the seam and introduced a smaller version of the same bug one step
out — a butt joint where cobble met dirt. The fade was baked into the road
image, and an image that tiles twenty-six times ALONG the road has no end to
fade at, so the ends were cut by geometry with a razor edge. `roadStrip` builds
the arms by hand with vertex alpha now and tapers all four sides; the inner
taper is timed against the paving's own, so the road is still invisible where
the plaza is solid and only reaches strength outside its rim. The two hand over
inside each other's fade and there is no join to find. The verge was tightened
at the same time — at the first setting the solid part of the track was
narrower than the fade either side of it, which came out as a dark smear on the
grass rather than as something carts use.

**"The benches look very clunky."** They were four boxes: a plank, a panel and
two solid blocks fourteen centimetres by forty-four for legs. Every dimension
was right and the thing read as a crate, because what makes furniture look like
furniture at this distance is not its outline, it is the GAPS. Three seat slats
with daylight between them, two back slats on posts, four square legs and a
stretcher — twelve pieces instead of four, merged into the same static mesh, so
it costs geometry at load and nothing per frame.

**The bunting was arrowheads.** A three-sided `ConeGeometry` is not a triangle,
it is a tetrahedron, and at half a metre across the flags hung over the square
like a row of spearheads. Cloth has no thickness, so `pennantGeometry` is a flat
triangle emitted with both windings — two faces without making the shared cloth
material pay for `DoubleSide`.

### M51.1 — the back lane
The belt of grass between the houses and the palisade was the last bare part of
Emberhold, and the first thing found there was not a missing prop.

**The ground cover had been switched off across the whole town.** M49.1 excluded
the scatter from a circle of `TOWN_RADIUS * 0.92` to stop wildflowers coming up
through the paving — but the paving only reaches two thirds of the way to the
wall, so the exclusion also swept the entire belt. Every blade of grass, every
tuft and every flower inside the palisade had been deleted to protect cobbles
that were nowhere near them, and the result was flat green baize with a fence
round it. The exclusion is a LIST of circles now — the paving, and one per
building — so the belt grows and nothing sprouts through a wall. That is the
whole of why it looked bare, and it cost no new art to fix.

The paved radius moved into `shared/town.ts` as `TOWN_PAVED_RADIUS_PX` in the
same change: it had been `radius * 0.66` inside the client's ground builder, and
the scatter needs to know exactly where the cobbles stop. Two copies of that
number is what let the safe-looking version happen.

**Then the things a village keeps out the back**, each behind the building it
belongs to so the ring reads as six households' yards rather than one decorated
circle: a pell and a rack of spears behind the Warden's Post, a hay rick and a
handcart behind the inn, straw skeps beside the herb gardens, rain butts at the
back corners, and two washing lines. Plus a worn earth lane running round the
whole belt — the piece that makes it read as ground people walk on rather than
as lawn.

### What the new rule caught
The back lane is the first dressing placed by BEARING behind the houses rather
than out in the open square, and a hay rick two degrees off ends up in somebody's
kitchen. So `tools/test/town.mjs` grew "nothing solid may stand inside a
building", and it immediately failed on SEVEN props — none of them new.

The bench, the lamp post and a planter at 292 degrees were inside the shop. The
same three at 338 were inside the east cottage. The handcart added one milestone
earlier was inside the west cottage. All of them had been there since the square
was widened, and none of them was visible: a lamp post inside a building can
only be seen from the back of that building, and nobody walks there — which is
exactly why the belt needed work in the first place.

The ring bearings are DERIVED now rather than typed. Every whole bearing is
tested against the real footprints at both ring radii — a bench ring and a lamp
ring are different distances out and a building is a rectangle, so clearing one
does not clear the other — and against the planter offsets and the gateways. The
middle of each clear run gets the furniture. It comes out at SEVEN rather than
eight, and that is the finding: between the east cottage and the east gate there
is no room at all, and there never was.

### Still bare, and known
The middle band of paving between the island and the benches is deliberately
plain — that is where players stand. The chapel's back yard is the emptiest of
the six and could take something of its own. ~~And nobody in town moves.~~ Done
in M51.3.

### M51.2 — the monument, and the flags
Two questions from the user, both about things the tests cannot see: *is the
statue big enough (2.5 units against a 1.8 player)*, and *is the bunting too
sparse now the flags are small*. Both were fair, and looking at the answer to
the first found a third thing nobody had asked about.

**The statue was 1.4 times life size, and that is the wrong number.** Not
because 2.5 is small in the abstract — it is a head and shoulders over any
player who walks up to it — but because it stands on a pedestal 2.17 units
tall. A figure 1.4 times life on a plinth taller than a person reads as
somebody standing on a box, and the base was out-massing the thing it exists to
hold up. Civic sculpture sits at about twice life and always has.

Fixed by the figure rather than by the plinth. Cutting the base down would have
brought the whole monument in under the well's roof and made the middle of the
square lower than the furniture round it; `STATUE_HEIGHT` is 3.4 now, which is
1.9 times a player and puts the crown at about 5.5. The ceiling on that is the
ROOFLINE: the inn's eaves are 4.8, so the monument is the tallest free-standing
thing in Emberhold and still stands below the ridges around it, which is what a
village square looks like and what a cathedral square does not.

**The bunting was a wire with something caught on it.** The flags hung 0.15
wide at 1.5 per unit — one every 67 centimetres, each a fifth as wide as the gap
beside it. That is not sparse bunting, it is not bunting; from across the
square it read as a cable with litter on it.

It is also a regression with a date on it. Phase 51 shipped the flags at half a
metre as three-sided cones, the user caught them hanging over the square like
arrowheads, and the fix cut them to a flat triangle a fifth the size — and
nothing put the SPACING back to match. A density and a width are one decision,
so `BUNTING_FLAG_WIDTH` and `BUNTING_FLAGS_PER_UNIT` now sit next to each other
with the ratio written between them: real bunting hangs flags about one and a
half times their own width apart, so the line reads as a band of colour with
light through it rather than as a row of separate objects. 0.28 wide at 2.4 per
unit is 42cm centres — the same ratio, at a size legible from the far side of
the plaza. Same argument the flower heads were sized by.

### The blue ghost on the monument
Found while framing the statue for a screenshot: there was a mage-shaped
silhouette painted down it, in the open, at noon — which is exactly what the
skeleton looked like one milestone ago, and this time the silhouette was
innocent.

**The Herald was standing behind the statue.** Elsbet Vane had held (215, 272)
since Phase 49, when the middle of the square was empty and just north of the
centre was the natural spot for a greeter. The statue moved in underneath her
and nothing reconsidered it. She is 8 pixels off the monument's own axis, so
every actor's through-walls outline — M49.2's feature, working perfectly —
traced a person straight down the one piece of scenery in town that a player is
meant to look at.

The general rule is worth stating because it is not about statues: **this game
has one camera bearing.** It looks along -z and the only thing a player may
change is how far away it is, so how far apart two things appear ACROSS the
screen is their difference in world x and nothing else. "Behind the statue" is
therefore not a position somebody can walk out of — it is a permanent property
of a bearing, and a townsperson who stands there stands there for the life of
the world. A player passing behind it for a second is the feature; a resident is
a defect.

So `STATUE_SIGHT_HALF_PX` is 70 — the monument's half-width plus a body's, plus
room to read the gap — and `tools/test/town.mjs` fails any NPC up-screen of the
statue and closer than that to its axis. Confirmed by putting Elsbet back where
she was, which fails with her name and the 8px in it. She stands at (255, 243)
now, off to one side and still facing the middle.

### Verified
All nine offline suites, `smoke.mjs` against a real socket, both workspaces
typechecking clean, and a headless pass over the square at noon, dusk and
midnight with zero console errors — the monument reads as carved, the flags read
as flags in lantern light as well as daylight, and the Herald is clear of the
stone.

One method note for the harness rather than the game: the game's camera is held
in front of walls, so an attempt to stand far enough back to fit the whole
monument in one frame gets the camera dragged to four units and fills the screen
with the back of the player's head. Three framings were lost to that before the
obvious answer — `setCameraColliders([])` from the console, for the diagnostic
shot only.

### M51.3 — the townspeople walk
Emberhold's last standing complaint, and the oldest: five people had stood
perfectly still since Phase 49. Everything else in the square moved — the
bunting, the brazier coals, the sun, the lit windows — and the only things in it
with legs did not.

**A round is a pure function of the clock.** Nothing is sent over the wire for
this and no tick advances it: `npcPoseAt(npc, nowMs)` walks a list of stops and
returns where somebody is, which way they are pointing and whether they are
mid-stride. It is the argument the day/night cycle already won — the hour is
derived in `shared/` rather than broadcast, so every client sees the same sky
without the server saying a word — and a townsperson's round is the same shape
of fact, since it depends on nothing any player does.

It also settles the thing that would otherwise have been genuinely hard. The
server decides whether you are close enough to buy something and the client
decides whether to draw the shopkeeper next to you; if those two ever disagree
the symptom is "the button does nothing", which is the worst failure an
interface has. Here they cannot disagree, because they are the same function of
the same clock. The phase is seeded off the id so five people do not step off
together.

**Two distances, and separating them is what makes a moving NPC safe to talk
to.** `NPC_TALK_RANGE_PX` is measured to where somebody is STANDING and decides
whether you may start — you walk up to a person, not to a spot they are
sometimes at. `NPC_TETHER_PX` is measured to their POST and decides whether you
are still talking, because a post does not move and a conversation must not end
because the other party took three steps. The tether is not a fudge factor, it
is a sum: talk range plus the furthest anybody may stray. If you opened the box
within talk range of where they were standing, and they are never more than the
beat radius from their post, you are never more than the two added together from
that post — and since you are standing still and the post is fixed, that
distance does not change while they walk. It replaced a `* 1.5` on the server
that was an honest shrug.

**And the game learned to walk.** `ActorAnim` had `idle` and `run`, and every
character rig in the pack ships a `Walk` that had never been played — `run`
listed it only as a fallback, so anything with both, which is all five class
bodies, had sprinted since the port. `walk` is its own state now, phase-offset
per actor unlike `run`: a pack chasing you is supposed to move together, and two
people crossing the same square in step read as a marching band.

Where they go is the point rather than the fact that they go. Tobin has the
longest dwell in town and it is at the anvil, because he is the only person here
with a job that keeps him in one place — his other two stops are him stepping
away from it. Cabel's far stop turns him toward the east gate, which is the one
the first monster camp stands nearest. Marda crosses between her own door and
the market stall. Everybody stands still for at least three quarters of their
round, and the test enforces it: a town where everybody is permanently in motion
is a parade, not a place somebody lives.

### What the rounds test caught, and what it did not
`tools/test/town.mjs` grew a section that walks every round at 60ms — finer than
anybody moves in a frame — because a stop two degrees out is a shopkeeper
standing in a well, and a LEG two degrees out is one walking through the side of
the inn four seconds at a time, which is harder to see than a prop indoors
because it is only wrong while it is happening. Nothing in the engine would ever
stop them: townspeople are not bodies the props collide with, so this test is
the only thing between the design and a watch captain in a water butt. It also
pins that every round is a closed loop, that nobody comes within a talk radius
of anybody else at any instant, and that the tether really is the sum it claims.

Then the sight-line rule from M51.2 — *nobody stands behind the monument* — went
green on a beat that walked the Herald straight back behind it, because it was
still only checking the POST. A rule written against five people who could not
move stopped covering the thing it exists for on the day they could, one
milestone after it was written. It walks the whole round now.

### The thing that was fixed one level too high
Moving her stop did not work either. She came out at 82px off the axis, well
past the 70px the rule allows, and a raycast against the real statue in the real
client said she was still drawn through it for 21% of her round.

The reason is perspective, and the arithmetic that says who clears the crown is
a trap. Under a parallel projection anybody far enough back rises above it, and
that derivation gives a clean number — but the camera is fourteen units away,
not infinitely far, so a near, tall occluder subtends far more angle than the
sums allow. Oswyn at 415px behind is measurably clear; the Herald at 296px is
not; and the boundary between them is not where any of three plausible
calculations put it. Same shape as the seam that turned out to be a plank:
reasoning survived several rounds, and measurement settled it in one.

So the fix moved up a level. **Townspeople no longer draw a through-walls
silhouette at all.** M49.2's outline answers one question — *where is the
character I am responsible for?* — and its three cases are your own body behind
a palisade, another player behind the inn, and a monster you are fighting behind
a tree. A shopkeeper behind a statue is not one of them: you do not need to see
them through it, you need to walk round it, which is what a person does about a
statue. And the cost of being wrong is worse for them than for anybody else,
because everything else the feature draws is transient — you move, the monster
moves, the occlusion lasts a second — while a resident behind fixed scenery is a
solid blue figure painted onto it permanently. That is what it looked like, and
it read as a broken renderer rather than as somebody standing behind something.

One option on `Actor`, defaulting on, and townspeople are the only thing in the
game that turns it off. It fixes the case behind the inn, the well and the
palisade too, none of which any placement rule was ever going to reach.

The sight-line rule stays, restated: not a rendering artefact any more, but the
smaller and more durable complaint that somebody parked on that bearing is a
person you can neither see nor click, permanently, because the camera cannot be
walked round. Deliberately conservative — leaving a narrow wedge of a
twenty-seven unit square empty costs nothing, and it means the rule never has to
be right about perspective.

### Verified
All nine offline suites, `smoke.mjs` against a real socket, both workspaces
typechecking clean. In the browser: all five townspeople measured moving 2.2 to
4.1 units and cycling between `idle` and `walk`; zero silhouette meshes on any of
them and two still on the local player; the player's own outline still drawing
through the palisade; a dialogue opened with Oswyn held for forty seconds
through a full round of his beat, and a purchase went through mid-walk. Noon,
midnight, zero console errors.

## Phase 52 — Waystones, and two verbs the world was already laid out for
Emberhold had six quests and three verbs between them: kill it, gather it, forge
it. The deepest thing about this world went unmentioned by all six — that every
camp, every node ring and every band is measured from spawn, so walking further
out IS the progression. Nothing had ever asked anybody to walk.

### The stones came first, because the verb needs somewhere to go
`reach` is trivial to implement and worthless on its own. "Go to (4880, 3104)"
is a coordinate, not work, and the walk pays off in an empty field. So the
milestone is really four **waystones** — the first built things outside the
palisade — and the objective is what points at them.

One for each band past the first, spiralling outward around the compass so no
two are on the same trip: the Gate Stone at 1,560px, the Sunken Stone at 1,980,
the Hollow Stone at 2,400 and the Ashen Stone at 2,780. Bearings were not chosen
by eye. A probe read the real camp and node tables out of the server and swept
every bearing at each radius for one that clears both, which is how the third
one ended up at 210 rather than the 240 the first draft wanted — 240 stands in
an ore node.

**Four silhouettes, not one slab four times.** Each has a blurb saying what it
looks like, and somebody who walks two thousand pixels on the strength of "split
top to bottom, and the gap is wide enough to walk through" should find a stone
with a gap in it. The Gate Stone is upright with a tally scratched into the
face; the Sunken leans south out of a heap of its own spoil; the Hollow is two
halves and a fallen wedge; the Ashen is blunt, dark and arranged.

Built with Emberhold's own `Builder`, which is now exported for the purpose —
same palette, same procedural surfaces, one merged mesh each. A landmark cut in
a different grey from the town wall is the same mistake a downloaded building
pack would have been. **One mesh per stone rather than one for all four**,
because Game fades whatever stands between the camera and the player per
material, and merged they would all dim together.

They are NOT solid. Nothing outside the walls is — not a tree, not a boulder —
and a second collision system for four props in a field is a rule the player
meets four times and a mechanism to keep honest forever.

### `reach`, and where the expensive half goes
The count is always 1, which is the honest shape rather than a degenerate case:
a place is somewhere you have been or have not. Keeping it in the same
one-counter-one-threshold mould means the tracker, the offer states, the
completion toast and the server's funnel all take it without a branch.

The interesting part is cost. `MOVE` arrives many times a second per player and
`advanceQuests` opens the quest table, so crediting on position naively would
put a database read on the movement path for every player in the world,
permanently, to answer a question whose answer changes about once an hour. So
**arriving is an event and standing is not**: four hypots run every packet, and
the table is only opened on the tick where somebody who was nowhere is suddenly
somewhere. The socket test walks in and out four times and the counter does not
move.

### `salvage` was already in the type and nothing pointed at it
It had been a `QuestObjective` variant since the day quests shipped, with no
quest using it — the same dangling limb as `lightning 0 weapons`. Two lines on
the server, and Marda's chain gained "Take It Apart", which exists to say out
loud the one thing about the anvil nobody finds on their own: taking something
apart is how you learn to make it. The batch handler counts by the batch's real
total rather than as one event, for the reason gathering counts by yield — the
same three items are one click on one tab and three on another, and a tracker
that disagreed with the bag reads as a bug.

### What the interface had to learn
A `reach` row cannot say "places reached 0 / 1". `objectiveIsCounted` splits the
two, and a place shows its own name and how far it still is — recomputed every
frame and rendered about twice a second, because the render key rounds the
distance to fifty pixels.

The minimap grew an **Objectives** layer, and it is arrows rather than blips for
a measurable reason: the nearest waystone is 1,560px from spawn and the widest
zoom shows about a third of that, so a dot would only appear once you had nearly
arrived. A guide is clamped to the rim along its true bearing, drawn as an arrow
with the remaining distance under it, and becomes a ring the moment it comes on
the map — which is the map saying "you can see it now". Only ACTIVE, unfinished
reach quests: marking all four stones permanently would make it a tourist guide,
and marking the one you took work for makes it an instruction.

Each stone carries a nameplate — the dim `node` pill normally, the gold banner
while it is what somebody has told you to walk to.

### Three things the tests refused
**The essence rule held.** The Ashen Stone paid 6 essence, and
`tools/test/quests.mjs` has asserted since Phase 49 that no quest may: essence
comes only off kills by design, and a quest reward is the exact back door that
would quietly stop that being true. The more so for the one quest in the game
whose whole point is that you did not have to fight anything. It pays refined
ingots instead.

**Two briefs never said what to look for.** A new rule — a `reach` brief must
mention a stone — failed "The Split Stone" and "Where Nobody Has Stood", both of
which said "third one" and "the last one" and never once named the object. That
is not pedantry: the brief is the only place the game explains the task, and
"go north-west" with no description is a player wandering past their own
objective.

**And the waystone section is the town test's prop rules, moved outdoors.**
Nothing in the engine keeps a landmark out of a goblin camp or off an ore node,
so the test reads the real `ringPack` and `ringNodes` tables out of the server
rather than restating them — a copy would agree the day it was written and stop
agreeing the first time a camp moved, which is the whole failure it exists to
catch. It also pins that no two stones are within one reach radius of each other
(two quests one walk finishes), that `landmarkAt` is therefore unambiguous, that
every stone is somewhere a quest sends you, and that each level gate follows the
band the stone is ACTUALLY in rather than a number typed beside the radius.

### Two things that were wrong on the screen
**The stone was a brick chimney.** It borrowed the town's `stone`, which carries
a coursed-masonry texture because every grey surface in Emberhold is something
somebody BUILT. A standing stone is a rock that was dragged upright. `rock` is a
new palette entry with a new procedural surface — broad blotches, a few cracks,
grit, and deliberately no repeating structure at all, because the moment a
monolith shows a grid it stops being a rock.

**And the trodden ring round each one was a hole cut in the field.** A flat
`CircleGeometry` with a hard alpha edge, which is precisely the artefact the
road's seam across the square cost three rounds of diagnosis in Phase 51. It is
a faded `ringedDisc` now, in the back lane's own brown — the same number, not a
shade near it, because a path behind the inn and the ground round a waystone are
the same substance.

### And one that had been wrong for three phases
The quest tracker sits at `right: 14px` and the dock rail is at the far right,
so the panel had always been underneath the buttons. Nobody had seen it, because
no row had ever been long enough to reach that far. "The Sunken Stone — 1700
away" reaches that far. It takes the minimap's own 82px now, which is what it
should always have done: it hangs off the map, so it takes the map's edge.

### Verified
All nine offline suites, `smoke.mjs`, both workspaces typechecking clean.

Two seeded socket runs against the real server, because both new verbs are gated
behind chains a fresh character cannot walk in a test. **`reach`:** standing at
the stone before taking the quest credits nothing; taking it sets the counter to
0; standing 80px outside the ring credits nothing; stepping in credits it and
the server says so; walking in and out four times does not over-count; handing
it back completes it and unlocks the next stone. **`salvage`:** `SALVAGE_ITEM`
advances by one, `SALVAGE_MANY` advances by the batch's real total, and the
completion is announced.

Plus a browser pass: all four stones present and distinct, the tracker counting
down 1700 → 1000 → 200 as the player walks, the minimap's gold marker tracking
it, and zero console errors.

## Phase 53 — A world worth crossing
User brief, in one go: *"Lets massively increase the world and create a dirt
path from beginners town, to another town north somewhere (will be building in
the future). Path should be lighten up with torches so its visible during night.
Start building good looking custom terrain/environment in the world — forests,
hills, rivers and so on. Revamp our world textures... Also remake ground/grass
to a better looking/more texture/high quality, because it looks too simple,
plain."*

Four milestones, in the order they unblock each other: the ground has to be
somewhere before it is worth resurfacing, and the road has to exist before the
land around it is worth dressing.

### M53.1 — five times the ground, and a road out of it
**16,000 x 12,000, up from 7,200 x 5,400.** Two constants, and everything else
in the game derives from them — `PLAYER_SPAWN`, the world-to-server transforms,
the movement clamps, the treeline perimeter, the ground-cover density. That the
resize was a two-line change is worth noting as the payoff for four phases of
not typing coordinates.

**THE BANDS DID NOT MOVE WITH IT**, and that is the decision. Last time the world
grew, every ring grew with it, on the argument that a band is a fraction of the
map. That argument stops holding the moment the map has more than one place in
it: the five rings are TUNED — a level-1 character clears band 1, the reforge
ladder is priced against band 5 — and stretching them to fill a world five times
the size would have re-paced the whole game to make room for a road. Emberhold's
neighbourhood is exactly where it was; every new pixel is frontier.

**A third gate**, and it could not go where it obviously should. Due north (270)
runs the road through the near corner of the shop. The natural opening is the
sixty-degree gap between the inn at 225 and the shop at 285, so the North
Postern is at 256 — the middle of the clear run, measured against the real
footprints at every radius rather than picked by eye. It is also NARROWER than
the east and west gates: at the highway's twelve degrees the road's rim still
clips the shop. Gates are a table now rather than two bearings and one shared
half-width.

**The road is a polyline, and that is the first thing in this world that is not
polar.** Everything else — bands, camps, node rings, waystones, the town — is a
radius and a bearing, which is the right shape for a world with one place in it
because distance from spawn IS difficulty. A road does not fit that: it is not
AT a distance, it crosses all of them. So `shared/road.ts` holds waypoints (still
polar, because that is the language the rest of the file speaks and because it
is how the route was checked) smoothed through a Catmull-Rom, and the client
draws the ribbon from it, the torches are placed from it and the test walks it.
One curve, three readers.

It has exactly one gameplay property and it is the reason to build a road rather
than draw one: **the road is the safe way through.** It passes near four camps
and inside none of them. Follow it and you get from the palisade to the frontier
without a fight; cut the corner and you meet mushnubs, then wolves, then orc
brutes. Every waypoint was moved until that was true — the first draft ran 147px
from a mushnub camp, which is well inside aggro.

**Fourteen torches, and the lights are the interesting part.** Three evaluates
every point light against every fragment of every lit surface, so a torch every
three hundred pixels down four kilometres would be an unaffordable number of
them — and most of them would be lighting ground nobody can see, since the fog
closes at 110 units. So a torch is two separable things. Every torch always has
a FLAME: an unlit emissive ball in the merged mesh, visible as far as the fog
allows, which is what makes the road read at night as a chain of lights going
north. Only the nearest five have a LIGHT, from a fixed pool re-pointed every
frame. The seam is invisible because a torch far enough away to lose its light
is far enough away that the ground under it was already dark.

They run on the town's clock, not their own — a frontier that lit on a separate
schedule would put two times of day in one frame.

### A bug the third gate found, four phases old
`inGateway` asked the OPPOSITE question. It computed a correct shortest angular
difference and then tested `180 - delta < HALF`, which is "is this bearing nearly
opposite a gate" — and with exactly two gates a hundred and eighty degrees
apart, that is accidentally the right answer every single time. `inGateway(0)`
came out true because of the gate at 180, and `inGateway(180)` because of the
gate at 0. Two wrongs, one per gate, cancelling perfectly.

Adding a third broke the coincidence in both directions at once: it opened a
hole in the palisade at 76 degrees, on the open ground behind the chapel, and
left the new postern's own bearing walled shut. Nothing else would ever have
found it, because nothing else asks the question anywhere but on a gate bearing
— the ring furniture derives its gaps from it, and it had been quietly excluding
the wrong arcs since Phase 49.

### And a test that kept its own copy of the world
`tools/test/town.mjs` had `const HALF_W = 7200 / 2` typed into it, and the moment
the world grew it reported eleven node rings as falling outside a world they sit
comfortably inside. A test holding its own copy of a number the game derives is
a test that reports the copy going stale as a fault in the game — which is
exactly the failure the same file's camp-reading code was written to avoid.

### The road was invisible for one run, and the reason is handedness
Every one of its 5,184 normals pointed at the ground. `roadStrip` and `beltPath`
emit the same vertex order and come out facing up, because they are authored in
XY and rotated -90 degrees about X on the way, which flips the handedness. The
new ribbon is built directly in XZ with no rotation, so the identical winding
produces the mirror image. The torches beside it stood there looking completely
correct, which is what made it read as "the road did not get built" rather than
"the road is facing down".

Found by asking the mesh rather than by reading the code: one `page.evaluate`
that counted normal signs said `{ up: 0, down: 5184 }` and the diagnosis was
over. Same method note as the seam that was a plank.

### Verified
All ten offline suites — `road.mjs` is new and checks the route leaves by a real
gateway, ends at the town site, never doubles back, keeps outside every pack's
aggro, keeps its full 190px width clear of buildings, and that the torches are
evenly spaced ALONG the curve rather than by index (which would bunch them on
the bends, exactly where a traveller needs to see where the road goes). Plus
`smoke.mjs`, both workspaces clean, and a browser pass at noon and midnight:
53,510 plants across 192 chunks, 434 draw calls, zero console errors, and the
road reading at midnight as a line of fires going north.


### M53.2 — the ground stops being one green
*"remake ground/grass to a better looking/more texture/high quality, because it
looks too simple, plain."*

It was two surfaces and two noise fields. That was enough to beat TILING — which
is what the file was written to solve, and it did solve it — and it left a
different problem behind that nobody had named: a field with exactly one kind of
boundary in it. Green here, brown there, everywhere, forever. Nothing to find
after the first second.

**The problem is not resolution, it is information.** A bigger source image does
not help, because the eye is picking up the period and then, once the period is
gone, the poverty of the vocabulary. So there are three fields now, at three
scales chosen not to be multiples of each other so that no two of them ever line
up into one visible feature:

- **Region**, the slowest — a full cycle is on the order of a hundred and fifty
  units, so it reads as the land changing rather than as a patch of anything. It
  drifts between two grasses, which means two patches of "grass" a hundred units
  apart are visibly not the same grass. This is the field doing the most work
  and it is the one that was missing.
- **Wear**, thresholded hard, with a second faster field breaking its outline so
  a bare patch is not an ellipse. That is the difference between "ground that
  has been walked on" and "somebody airbrushed here".
- **Stone**, riding ON the wear field rather than being its own, so gravel can
  only ever appear inside bare earth. It is what gives a worn patch an EDGE
  instead of a fade, and never turns up in the middle of a lawn.

**And a near-field detail layer, which is the one that actually fixes "plain".**
At this camera the ground nearest the player fills a third of the screen and was
being drawn with exactly the same information as the ground at the fog line. A
metre-scale multiplier now runs on the albedo and fades out completely by 34
units. The fade is not an optimisation, it is the entire trick: a
high-frequency multiplier carried into the distance aliases into shimmer, which
is worse than flat. Because it is gone before it can shimmer, it can be far
stronger than a global one ever could.

Four Poly Haven surfaces rather than two, chosen close in VALUE and far apart in
TEXTURE — a pale sand beside a dark loam reads as two materials meeting, while a
leafy grass beside a dry leafy one reads as one field that is not the same
everywhere. Four and not more, because every surface is three texture units and
two more samples per fragment on the largest thing in every frame.

**Not every surface gets a normal map.** Grass and dirt carry the two that
matter — they are the pair that meets at every worn edge, which is the only
place on flat ground where the lighting difference between two surfaces is
legible — and the regional grass and the gravel borrow whichever is dominant.
Four normal samples to perturb lighting that at a forty-degree camera is mostly
flat anyway is a bad trade.

The tile came down from six units to 3.4, which is what puts detail under the
player's feet: at six metres a blade of grass in the source image arrived at
roughly one screen pixel, which is detail paid for and not seen. Halving the
tile doubles how visible the repeat would be, and the three fields above are
what pays for it. Anisotropy went 8 → 16 at the same time, because a smaller
tile is a steeper UV gradient and that is exactly what anisotropy is measured
against.

### Verified
All ten offline suites, both workspaces clean, and a browser pass: the full
84-item load completes in 14 seconds with the twelve new texture files on the
wire, and the wide shot shows the region field working — green foreground, a
broad dry band across the middle, green again beyond. Zero console errors.

### Still to come in this phase
M53.3 is relief — the play area is a perfectly flat plane and no amount of
surface work fixes that. M53.4 is forests as regions rather than a treeline, and
a river the road has to cross. *(Both done — see below.)*


### M53.3 — the ground stops being a plane
Four surfaces and three noise fields made the ground interesting to look AT and
did nothing about the thing underneath them: it was a perfectly flat sheet from
the palisade to the fog line, and no amount of albedo fixes that, because the
LIGHT never changes across it. A slope catching the sun on one side and falling
into shade on the other is most of what makes ground read as ground.

**The play area was flat on purpose, and the purpose turned out to be wrong.**
The comment said elevation inside the bounds would be "a lie the simulation does
not know about". It is a lie, and it is free — every distance in this game is
measured in the XZ plane and nothing anywhere reads a Y. Two things a metre
apart horizontally are a metre apart whether one is on a rise or not. So height
is purely a rendering property: it cannot desync, cannot be exploited, and does
not have to be shared with the server. The only game it would break is one where
you could shoot over a hill, and nothing here has ever had line of sight.

What it cost was one helper and a sweep. `onGround(x, z)` returns the XZ plus
the height under it and is spread into every call that used to pass a literal
zero — the player, other players, monsters, townspeople, resource nodes, the
workbench, loot, all six targeting rings, the camera's look target, the road
ribbon (per VERTEX, or the verges sink into the hillside), fourteen torch posts,
the signpost and the cairn.

**Things that were BUILT get levelled ground under them.** A paved square, a
monument's apron, a cairn — all of them are flat discs of geometry, and a flat
disc on a slope is a disc with one edge in the air. `FLAT_SPOTS` levels the
ground at Emberhold and at each of the four waystones, easing back to the land
over a shoulder. The town's shoulder is forty units rather than twenty-two,
because the land can now sit eleven units below its level and a short blend puts
the town on a mesa.

Those spots are DERIVED from the landmark table rather than registered as the
waystones are built, and that is a correction: the first version had an
`addFlatSpot` the waystones called, which is a footgun with a very quiet failure
— the terrain MESH is generated in the World constructor and the waystones are
built several awaits later, so every spot registered afterwards would have
levelled the height function and not the ground. The monuments would have stood
in flat dishes cut out of a hillside that was still drawn as a hillside.

**The first amplitudes were far too timid, and the measurement is why.** ±3 units
over a seventy-five unit wavelength is a four per cent grade, and at a
forty-degree camera four per cent is not subtle, it is invisible: nothing tilts
far enough to catch the light differently. Tripled, with the wavelengths
stretched to match, which puts typical grades near one in six. The upper bound
is about animation rather than about hills — a body slides along XZ at constant
speed and takes its height from the field, so on a steep enough face it climbs
faster than its legs move and reads as skating.

The terrain mesh went from 170 segments to 300, because 170 was nine units a
quad on this world and the shortest term in the field has a thirty-three unit
wavelength. And the fog opened from 40–110 to 55–165, since the far ridge was
being washed out before it resolved — which is the exact impression the hills
were added to fix.

### A black band, and four wrong diagnoses
Everything beyond about forty units rendered pure black, with a clean edge.
Shadows off: still black. Fog off: still black. Shadow camera widened from ±34
to ±100: still black. Replacing the terrain material with flat red: the band
vanished, so it was the shader — and then normals off, detail layer off and the
ARM maps off all left it exactly as it was.

It was not the shader. **Vite was serving `index.html` for every one of the six
new texture files** — 90,042 bytes, byte-identical for all six, which is what a
public-directory 404 falls back to in a dev server. The browser decoded an HTML
document as a JPEG, got nothing, and sampled black. The dev server had been
started before `tools/art/terrain.mjs` downloaded them.

The tell was there the whole time and it was not in the picture: six different
textures with the same content-length. The reason it looked like a distance
effect is that the regional field has a thousand-unit wavelength, so `region`
went from 0 to 1 across the visible ground — near ground was grass and far
ground was 100% of a texture that did not exist.

Worth writing down as a rule rather than an anecdote: **when a shader looks
wrong, check the bytes before the maths.** Half an hour of bisecting a fragment
shader was spent on a file that was never on the wire.

### Verified
All ten offline suites, `smoke.mjs`, both workspaces clean, and a browser pass
over the frontier and the road at noon and midnight: the height field measures
-10.4 to +9.0 with the town centre at exactly 0, the road follows the land, the
torches stand on it, and there are no console errors.


### M53.4 — six woods, and a river with one bridge over it
The last milestone of the phase, and the two halves of it turn out to be the
same idea from opposite directions: the frontier M53.1 opened up is four
kilometres of ground with a road down the middle, and until something out there
looks different from everything else out there, the journey north is a long walk
across one field. A forest gives the frontier PLACES. A river gives it a SHAPE.

#### The rule that had to be sharpened before a forest could exist
Since Phase 47 nothing scattered inside the play area has been allowed to be a
tree, a boulder or a bush, because those three ARE the harvestable nodes —
scenery that can be mistaken for something interactive teaches the player to
click on scenery. That rule is why the treeline is a perimeter standing outside
the bounds, and under it a forest is illegal.

So it is sharpened rather than broken. **The woodcutter's tree is the
round-crowned broadleaf and nothing else in the world may wear it.** The node
gives up the two pines it used to borrow; every conifer, twisted trunk and dead
stick becomes scenery. Three separating channels, none of them colour: two
disjoint model sets, a scale gap (a node is 3.4–4.6 units, a forest tree starts
at 6), and the node's own nameplate pill. `tools/test/forests.mjs` reads both
lists out of the real source files and fails if they ever intersect again —
this is a rule about two arrays in two files that nothing in the engine keeps
apart, and its failure arrives as a vague complaint rather than a bug report.

The perimeter treeline gave up its broadleaves at the same time, which was not
optional: the boundary and the woods inside it have to be made of one
vocabulary or the edge of the map reads as a different country.

#### Emberhold's district stays open ground, and that is a gameplay call
Every wood's edge is past the furthest monster camp — 2,900px, measured from the
last pack's near edge rather than picked as a round number. The five bands are
where the game is PLAYED: telegraphs to step out of, camps to judge the size of
from a distance, nodes to spot. Filling them with trunks costs all three. So the
district is open and the land takes over past it, which also means walking out
of Emberhold now looks like leaving somewhere.

It also removed a whole class of placement problem: no wood can swallow a camp,
stand on a node, or hide a waystone, because none of them are out there. The
test asserts all three against the server's own tables rather than a copy.

#### A forest is a region, and the edge is the entire problem
Six woods, each with a name, a species and a blurb — Pinereach, Blackstand, the
Mirefen, the Thornwood, Sorrowwood and the Weeping Wood. A disc with a soft
falloff would read as a gradient of trees, which is not what the edge of a wood
looks like from any angle: a wood has bays and spurs, it ENDS, and it ends at a
different distance depending which way you walked in. So the radius itself is
warped by noise at a third of the wood's own size and the falloff across the
warped edge is short, with a second faster field punching clearings into the
interior. The test sweeps the bearing round each wood and fails any whose
outline varies by less than twenty per cent — "it is a disc" is a thing you can
measure.

Placement is rejection sampling against that field, over-sampled 1.9x, so
density follows the SHAPE of the wood rather than being uniform inside a ragged
outline. Instanced and chunked on the ground cover's own grid — 1,090 trees and
2,420 pieces of undergrowth in 600 instanced meshes. Chunking matters far more
here than it did for the grass, where the measurement showed very little was
ever off screen: a wood is sixty units across and the fog closes at 165, so most
of the world's trees are behind the camera at any moment.

#### The ground under a wood, and the ground beside a river
The terrain shader is three noise fields of world position, which is exactly
right for wear and region — they are patterns. A forest and a river are not
patterns: they are a table of six discs and a two-hundred-point polyline.
So both are **baked onto the terrain mesh as vertex attributes** — two floats a
vertex, computed once, interpolated free. `aCanopy` pushes the wear field up to
a litter floor, pushes the dry regional grass down and darkens the tint by
nearly forty per cent, which is most of how a canopy reads from OUTSIDE it (the
shadow map covers thirty-odd units around the player and a wood is sixty
across). `aWet` lays shingle along the bank, broken by its own noise, because a
band of constant width is a hem sewn onto the river.

The ground cover is thinned under a canopy rather than removed — the wood plants
its own floor of ferns and broad-leaved plants — and thinned by a hash of the
POSITION rather than by the scatter's own generator, because the predicate is
called several times per placement while it retries and a draw from the sequence
would make where a plant grows depend on how many times the loop bounced.

#### The Coldwater, and the one gameplay property that pays for it
The road's property is that it is the safe way through. Its weakness was that
cutting the corner only cost you a fight, so a player who could take the fight
had no reason to stay on the curve. The river answers that:

> **THE ROAD IS THE SAFE WAY THROUGH. THE BRIDGE IS THE ONLY WAY ACROSS.**

The whole frontier north of the water — the far half of the map, the last
stretch of road, and Coldharrow's site — is reachable at exactly one point, and
that point is on the road. The course starts and ends OUTSIDE the map on both
sides, because a river that stopped at the boundary would be a canal with two
ends in a field and, more practically, something a player could stroll round.

It is authored in **absolute world pixels, not polar**, and that is the second
step away from a coordinate system built for a world with one place in it. The
road's waypoints are still polar because that is how the route was checked
against the camps; a river has nothing to do with the camps at all. It is a
feature of the land, so it has a coordinate.

**It is the first solid thing outside the palisade**, and the exception is
deliberate rather than a change of policy. Phase 52 wrote down that nothing out
here is solid, because a second collision system for four props in a field is a
mechanism to keep honest forever in exchange for nothing. A river is the
opposite trade: one shape, the reason the bridge exists, and a river you can
stroll across is a blue stripe painted on the grass. One call added beside
`resolveTownCollision`, which is where movement is already resolved.

**The bridge is DERIVED, not typed** — the intersection of the two curves, so
moving a waypoint in either file keeps it on the crossing. The test pins that
the two meet exactly once: a road that forded the same river twice would need
two bridges and would have one.

#### A river has to run downhill, and the ground has to hold it
A river drawn ON a height field is a blue ribbon lying across a hillside and
reads as exactly that from the first frame, because water is the one surface
everybody has an intuition about and the intuition says it finds the bottom.
Cutting the land for it is nearly all of what makes it convincing; the water
plane does very little.

Two properties the cut must have, and they are why it is thirty lines rather
than a subtraction:

- **The surface must not run uphill.** The natural field wanders ±10 units, so a
  river at constant height is a canal on stilts at one end and underground at
  the other, and a river that simply followed the land flows both ways at once.
  So the land is read ALONG the course, low-passed over a thirty-three point
  window, and then forced monotone from the source down — which is what a river
  does to a landscape given ten thousand years. It drops 3.5 units end to end.
- **The banks must contain it.** Levelling to a target is not enough: where the
  land sits below the water the ground has to be RAISED to a crest, or the river
  floods sideways and the water plane ends halfway up a hill with grass showing
  through it. The profile is absolute near the water — bed, bank, crest — and
  only blends back to the natural field 26 units out.

The bridge and the road ramp are measured from the WATER, not from the ground.
A deck at ground level plus a constant puts one end of a bridge in the river on
any bank not level with the other, which is every bank. The road ribbon asks
`roadSurfaceHeight` per vertex, which is the terrain everywhere except over the
channel, where it is the deck with an eased ramp of the same length and easing
the bridge banks its own approaches with. Two of the fourteen torches end up
standing on the deck, which is where a traveller at night most wants one.

#### And the names finally reach the player
This world has had names in it since Phase 49 and had never said one out loud
outside a quest brief. `shared/places.ts` answers "where am I" as a pure
function over tables that already existed, and one line under the minimap shows
it. The ORDER is the design — built things, then water, then road, then land —
because several of these overlap and what you want to be told is the most
specific thing that is true. **Null is a real answer**: most of the map is field,
and inventing "the Eastern Reaches" for every square of it would make the
fourteen that are genuinely places worth nothing. The test fails if more than
forty-five per cent of the world has a name.

It sits UNDER the map frame rather than inside it, which is a correction: inside,
the round map's own mask ate the last three letters of "The Coldwater Bridge" —
and would have eaten a different number of them at each of the four map sizes.
The row's height is always reserved, so the dock rail does not step up and down
as you cross a treeline.

### Four things the screenshots caught
**The bank was a one-unit lip.** A cross-section of the finished ground read
-5.3 in the bed and -1.9 on the bank: a channel three and a half units deep, of
which two and a half were under water. What SHOWED was a one-unit rise over
seven units of bank — a four-degree grade, which is the same invisible number
the first pass at the hills was rejected for. The crest went to 2.4.

**And it still would not read at noon**, which was the second lesson rather than
a second bug: relief only reaches the eye through the LIGHT, and at noon the sun
is overhead and a slope catches within five per cent of what flat ground does.
Three rounds of screenshots at 12:00 said the carve had not worked. One at 15:07
showed it plainly. Verification hours are now noon AND a low sun, because half
the work in this phase is invisible at the hour that is easiest to shoot.

**The water was a diffraction grating.** Three straight sines across a river
read as corduroy laid on it — regular enough that the eye finds the period in
about a second. Water never has a straight wavefront, because the wave in front
of it is in the way. Every phase is bent by a much slower field now, which is
the ground's own three-fields argument one dimension down.

**And it vanished at dusk.** A smooth, dark, non-metallic surface with no
reflection to catch is very nearly black the moment the sun is low, and the
river disappeared into its own bank — wrong in the one way that matters, since
the river is the thing you must not walk into. Real water is legible at night
because it reflects the sky and this renderer has no probe to give it one, so it
gets a constant dim blue standing in for the sky it cannot see.

### One measurement that was the tooling, not the game
For two runs the character was missing from half the screenshots and the camera
sat eighty units behind them. It was headless Chromium throttling
`requestAnimationFrame` to about one frame a second, so the camera's easing
never caught up between a teleport and a shot — the screenshot forces a render,
the easing does not. The probe drives `world.follow` directly with a whole
second of dt now, which saturates every ease term. Worth recording beside the
six textures Vite never served: **when a browser pass looks wrong, suspect the
harness before the renderer.**

### Verified
All twelve offline suites — `river.mjs` and `forests.mjs` are new — plus
`smoke.mjs` and both workspaces typechecking clean.

`river.mjs` checks that the course leaves the map at both ends and never doubles
back (the fast bucketed distance query assumes x-monotone, and a course that
turned would answer some queries with the wrong segment); that the bucketed
query agrees with a full polyline walk at all 3,627 probes; that no camp, node
or waystone reach-ring is in the water; that the road and river cross exactly
once and the deck spans past the banks; that following the road end to end — at
its full width — never gets your feet wet; that the water is solid for its whole
length except at the bridge; and that wading in pushes you out in one step, onto
the bank you went in from, idempotently, without shoving anyone off the deck.

`forests.mjs` reads `NODE_MODELS`, the forest species table and the treeline out
of the real source files and fails if the harvestable tree and the scenery ever
share a silhouette or a height; checks the frontier rule against the canopy
FIELD rather than the discs; checks no camp, node or waystone is under canopy;
checks the road runs through a wood and the river past three; and checks every
name comes back out of `placeNameAt` while most of the map stays nameless.

Browser passes at noon, mid-afternoon, dusk and midnight: 53,510 plants and
1,090 trees with 2,420 pieces of undergrowth across six woods, 670 draw calls at
maximum zoom inside a wood, a 7.3 second load, and zero console errors. The
bridge reads at midnight as a lit crossing with torches on the deck, the road
ramps onto it and off again, and the place readout names the wood you are
standing in.

### The camera pitch question, answered
Raised at the end of M53.3: the hills read in shading but never SILHOUETTE,
because the fixed 41° pitch means you almost never see a horizon — and making
them read as shapes would be a pitch change the decisions log deliberately
forbade.

**The pitch stays, and this milestone is most of the answer.** The log's reason
is about gameplay legibility — a flatter camera changes what a telegraph circle
and a body's footprint look like, and those are things the player reads
positionally to decide where to stand — which is a stronger claim than "hills
would look better". But the want underneath it is real, and it does not actually
require a horizon: **a silhouette comes from what stands ON the ridge, not from
the ridge.** A treeline running over a rise reads as a rise; a wood that
disappears behind one reads as ground going away from you. That is now true in
six places, and the fog opening to 165 in M53.3 is what lets you see it happen.
If it still is not enough, the next lever is more relief and more trees OUTSIDE
the play bounds, where nothing is ever fought and the amplitude is free — not
the camera.


---

## Phase 54 — The world moves
User brief: *"keep working on the world building / environment / textures and
details"*, after Coldharrow was parked.

### M54.1 — wind, and the bug it uncovered
Everything in this world had been standing perfectly still since Phase 47.
Eighty thousand plants, eleven hundred trees, a treeline round the whole map,
and not one of them had ever moved. A day passed overhead, a river ran, torches
flickered, and the grass under all of it was frozen — which was the loudest
remaining thing saying *diorama* rather than *outdoors*.

**The wind is DERIVED, not sent**, exactly as the hour is, and for the same
reasons restated rather than assumed: it drives motion and nothing the server
resolves, so a message carrying it is a message that can arrive late or drift
between two people standing in the same field. Two sines at unrelated periods,
neither of them a fraction of the 24-minute day — wind that gusted on a whole
fraction of the day would arrive at the same strength at the same hour forever,
which is the one thing that would make it read as an animation loop. The
strength floor is 0.34 and not zero: dead calm reads as the animation having
broken, which is worse than no animation at all.

One shader hook, taken by the ground cover, the six woods and the treeline. Four
things it has to get right, each of them a way the obvious version looks wrong:

- **The base must not move.** A plant swayed as a whole slides across the
  ground and reads as an object being dragged. The displacement is weighted by
  height above the instance's own origin, squared.
- **Neighbours must be out of phase**, seeded from WORLD POSITION — which turns
  the whole scatter into one travelling wave for free, and means two plants next
  to each other move almost together while two a hundred units apart do not.
- **The direction is the world's, not the plant's.** Every instance carries a
  random yaw so it does not look stamped; displacing along a local axis would
  blow each plant a different way, which is confetti, not weather. The world
  wind is projected onto each instance's own axes on the way in.
- **The phase comes from the clock.** A renderer that integrates `dt` drifts: a
  backgrounded tab comes back ten minutes behind everybody else.

### The phase did not fit in a float32
The first version put `Date.now()`-scale numbers into a shader uniform. A
uniform is a **float32**, the phase was about 2.9 billion, and float32 spacing at
2.9 billion is **256** — so the wind stood still for minutes and then jumped a
hundred and sixty radians. What that looked like from outside was not "the phase
is quantised"; it was *"the grass moves and the trees do not"*, which sent two
rounds of investigation at the forest code.

The phase wraps now, and it wraps SEAMLESSLY rather than merely small. The
shader computes `sin(phase * rate * LEAN)` and `sin(phase * rate * FLUTTER)`, so
if every rate is a multiple of `SWAY_RATE_STEP` and FLUTTER is a whole multiple
of LEAN, wrapping at `2*PI / (STEP * LEAN)` advances every one of those
arguments by a whole number of turns. The wrap is exact, not hidden. The client
snaps every rate to the step on the way in rather than trusting the tables,
because "all the sway rates happen to be multiples of 0.05" is exactly the kind
of invariant that holds until somebody types 1.33 — and `tools/test/wind.mjs`
additionally reads the real tables and fails if one is authored off the step.

### And then: the world was never sparse. It was STACKED.
The open frontier looked empty. Raising the ground cover from 53,000 plants to
82,000 changed the picture **not at all**, which is the measurement that started
this.

Six rounds of bisection, in order, because every step ruled out the obvious:
instance matrices all finite and non-degenerate; bounding spheres correct;
frustum culling disabled (5,166 draw calls, 33 million triangles submitted) and
the near ground still bare; the terrain hidden so nothing could occlude them;
every plant repainted opaque red so nothing could be alpha-cut away — **0.68% of
the frame**. Then: scale every instance within twelve units of the player up six
times. Three hundred and seventy-nine instances became **five giant clumps**.

They were all in the same places.

**The seeded generator was broken, and had been since Phase 47.** It was the
textbook C LCG, copy-pasted into six files:

    s = (s * 1103515245 + 12345) & 0x7fffffff;

In C that is exact, because the multiply wraps at 32 bits. In JavaScript there
are no integers: `s` reaches 2^31, the product reaches 2.4e18, and the double
loses every bit below 2^53 **before the mask ever runs**. The low bits of an
LCG's state are the only bits it has. Measured: 200,000 draws produced **11,064
distinct values**.

Why it survived six phases is the part worth keeping. Every obvious check
passes. It is deterministic. It is fast. Its histogram over twenty buckets is
flat to within one per cent — it is *uniform*, there are just very few distinct
values. So eighty-two thousand plants were placed on about five thousand
positions, in stacks, and every counter in the game reported a full world while
the world looked bare. Nothing about a screenshot says "your random numbers
repeat"; it says "the frontier looks empty", which sends you off to tune
densities that were never the problem.

The fix is `Math.imul`, the one operation in the language that multiplies two
32-bit integers and keeps the LOW 32 bits. One implementation in `shared/rng.ts`
now, with the six copies deleted — it also drove the star dome, the login
backdrop's treeline, the palisade's post jitter and every procedural texture in
Emberhold, all of which were quietly repeating too.

`tools/test/rng.mjs` asserts the properties that FAILED rather than the ones
that are easy to write: period, and pair coverage over a 64x64 grid — because
positions are taken two draws at a time and a generator can have a long period
and still walk a lattice.

### The grass went up, and it is the same decision as the wind
The counts were set in Phase 47 against a camera at 14.5 units and a play area
of 120x90. The camera comes out to 46 now and the world is 400x300, and at that
range a third-of-a-metre tuft is a few pixels that read as ground texture. More
of them AND bigger, because the two failures are different: more fixes "there is
nothing here", bigger fixes "I cannot see what is here".

### Verified
All fourteen offline suites — `wind.mjs` and `rng.mjs` are new — plus
`smoke.mjs` and both workspaces clean.

Motion cannot be seen in one screenshot, so the browser pass measures it: three
frames at a pinned camera and a frozen hour, differenced. The difference image
is the strongest evidence available and it is a picture of exactly the plants
and nothing else. Open meadow went from 1.6% of world pixels moving to **8.9%**
after the generator fix — same plants, finally in different places. 273 draw
calls, 1.77M triangles, a 5.3 second load, zero console errors.

### M54.1a — the bridge, reported from play
Three faults, all found by walking it rather than by any test, and all three the
same underlying mistake: **the crossing was three separate opinions about where
the road is.**

**You walked THROUGH it.** The player's feet came from `onGround`, which read
`terrainHeight` — and over the Coldwater the terrain is the riverbed. So you
crossed by walking down into the channel, under your own bridge, and up the far
side, while the road you were following went over the top. There is one
`surfaceHeight` now: the deck over the span, the ground everywhere else, taken
by the player's feet, the camera's look target, the road ribbon per vertex, the
torch posts and anything dropped on the deck.

**The join was a step.** The approaches were nine boxes of earth stepped up to
the deck and laid on top of a height field that knew nothing about them, so the
ground and the boxes met wherever they happened to meet and the ribbon sampled
neither. The ramp lives in `terrainHeight` now, which is what makes the
transition impossible to get wrong rather than merely fixed.

Two numbers came out of measuring it. The ramp was 220px — five and a half world
units, and the terrain mesh is 1.63 units a quad, so a THREE-QUAD ramp was being
asked to describe a smooth climb. And the deck was 1.9 units above the water
while the bank crest is 2.4, so the road had to dip into a hollow to get onto
the bridge. Deck to 2.9 and ramp to 420px puts the deck just above the bank and
the climb at about one in five.

**The dirt ran across the planks.** The ribbon was drawn at deck height over the
span — a dirt track painted onto a timber deck, two surfaces claiming the same
millimetre. It fades out through the last eighty pixels of the approach now,
which is where wheel ruts would stop anyway.

**And the torches stood in the road.** A torch landing inside the span was
planted on the deck at the road's own offset, in the middle of the one stretch
of the route with no verge to stand it on. They are bracketed to the parapet
now — moved out to the rail line, shortened, with an iron collar instead of a
ring of stones, because a post pushed into the ground and a post fixed to a rail
are not the same object.

### Two things that fell out of fixing those
**The parapets were not solid.** The deck was a rectangle where the river's
collision did not apply, which is most of a bridge and not the important part —
the sides were open, and the only thing between a traveller and the water was
that the deck happened to be drawn there. A body is clamped to the walkable
strip now, sliding along the rail rather than being bounced off it.

**And the clear span had to be wider than the road.** The obvious value is the
road's own width, so the bridge is the road continuing. That is wrong, and the
way it is wrong is worth keeping: the bridge's frame is a STRAIGHT line — the
road's tangent at the single point where the two curves meet — while the road
goes on bending across the span. By the far abutment its verge had wandered nine
pixels past its own half width, so a clear span of exactly the road's width put
the outside wheel rut through the parapet. The test measures the real curve and
fails if the number is ever short of it again.

The deck also came down from 400px to 320px either side. It used to have to
clear the whole cut, banks included, because there was nothing to get you up the
slope — and a deck long enough for that is two and a half times the width of the
water, which reads as a pier. With the approach in the height field it only has
to be a bridge.

### One more note for the harness
Two rounds of "the source is right and the runtime disagrees" were a Vite dev
server that had been running across many edits and was serving stale modules for
two of the files. Restarting it fixed it instantly. Same family as the six
textures Vite served as `index.html` in M53.3: **before bisecting a renderer,
confirm the bytes it is running are the bytes you wrote.** The browser pass now
restarts the dev server first.

### M54.2 — ambient life, WIRED. And four more things reported from play.
`ambience.ts` had been written and committed and imported by nothing. Three
lines wired it in — a field, a `scene.add`, a call beside `river.update` — and
then five rounds of measurement said the hard part was never the wiring.

**Two real faults in the file as written.** A dragonfly's height was
`m.ay * 0.55`, where `ay` is an ABSOLUTE world height, so halving it put every
dragonfly underground on high terrain and in the air on low. And `ay` came from
`terrainHeight`, which over the Coldwater is the RIVERBED — so the one kind
whose whole purpose is to be over the water was anchored three units under it.
That is `surfaceHeight`'s lesson from M54.1a arriving a third time, and it now
has a third name: `flyingGround` here, `groundAt` in `mist.ts`, neither of them
`surfaceHeight` itself, because a dragonfly is entitled to fly under a bridge.

**And then the number nobody had:** how many of the pool are ON SCREEN. Three
rounds of screenshots said "the field looks empty" and none of them said why,
because "a mote exists", "a mote is drawn" and "a mote is where the camera is
pointed" are three different questions and only the first had ever been asked.
At `RADIUS = 74` with 76 butterflies it was **three**. The radius had been
chosen against the fog — a respawn should arrive already faded — and the
arithmetic nobody did is that a 74-unit disc is seventeen thousand square units
while the camera can resolve a wedge of about sixteen hundred, half the disc
being behind it. 26 is roughly what the camera sees, and the popping the big
radius was bought to avoid is solved properly instead, by an `edgeFade` on
DISTANCE that does both ends in one expression and needs no per-mote birthday.

**Then it went too far the other way**, which is worth keeping because it is the
same failure of judgement in the opposite direction: 150 butterflies at 0.58
units put forty on screen at sixteen pixels each, and an untextured polygon that
big does not read as an insect. Reported from play in one sentence: *"Theres way
too many butterflies in some places?"* The fix was three things and only one of
them was the count — smaller (0.2–0.3), fewer (62), and **the flap now closes to
0.08 rather than 0.35**, which is the change that actually did it. A butterfly at
the top of its beat is edge-on and effectively gone, so what the eye receives is
an intermittent flicker; a wing that never shrinks below a third of its span is
continuously present, and a shape that is continuously present is paper.

The wings also got a real dihedral. They rose 0.12 over a 0.5 span — thirteen
degrees, which is flat — and the flap is a squash along the wing axis, so
squashing a horizontal wing seen from above changes its width and nothing else.
At forty degrees the same squash folds a V shut and opens it, which is a
wingbeat, and it costs the same.

Birds came down from 22–34 units to 11–18. The pitch is fixed at 41 degrees
looking DOWN, so nine birds at thirty units never once projected inside the
viewport — paid for on every frame and never seen by anyone.

### M54.3 — fire that is actually burning
Every open flame in the project was one object: a small emissive icosahedron in
flat orange, scaled on two sines. Fourteen road torches, two braziers, the
smithy's coals. At three hundred units that is a perfectly good pinpoint of
light and it is what makes the road read at night as a chain going north; at ten
units it is an orange ball on a stick.

`flame.ts` is one instanced quad for every fire in the world, billboarded
CYLINDRICALLY — screen-right across, world up along, so it turns to follow you
and never leans as the camera pitches. The shape is cut in the fragment shader
rather than modelled, because the silhouette has to change every frame: a width
profile that pinches with height, displaced by scrolling noise whose amplitude
grows with height so the base stays on the wick and the tip whips, and a top
that wanders on its own slow noise so the flame GUTTERS rather than merely
brightening. Two columns of the instance matrix carry width and height
separately, which is free and is the whole difference between a torch (a tongue
of rag and pitch) and a brazier (a basket of logs).

**The colour ramp runs on HEIGHT, not on heat, and that is the interesting
mistake.** The obvious version ramps by temperature — red where cool, white
where hot — and it is wrong twice. A real flame is white at the wick and red at
the tip, which is a gradient UP the flame and not IN from its edge. And on an
additive surface the cool end of a colour ramp is not dim, it is a different hue
at full strength: the low-heat band across the bottom of the quad came out as a
solid maroon triangle sitting in the brazier, which looked like painted card.
Height decides the hue, heat decides only the brightness.

Two things fell out of looking at it. The brazier's coals were an
awning-coloured ball — the right call when it was the only warm thing in the
basket, and the wrong one the moment a real fire went in behind it; they are
charred and smaller now. And the whole output is multiplied by 0.72, because
additive light on a surface a point light is ALREADY brightening saturates long
before the shader thinks it has: the first version turned the iron basket into a
flat white disc.

### M54.4 — ground mist
Distance fog has been in since Phase 47 and does what distance fog does. What it
cannot do is BE somewhere. `mist.ts` is overlapping horizontal sheets — the old
trick, and the right one at this camera specifically, since a fixed 41-degree
pitch means a ground-parallel sheet is always seen at the shallow angle at which
a flat card reads as depth.

Where it lies is a rule, not a scatter: `mistAt` answers over the water, in the
hollows and under the trees, blended rather than picked, because a hollow in a
wood beside the river is the mistiest place in this world and a rule that chose
one reason would say it was only as misty as its strongest. Height is a pure
rendering property in this project — nothing anywhere reads a Y — which makes it
exactly the right field to hang mist on: it already describes where cold air
would sit, and using it desyncs nothing.

When is deliberately NOT symmetric about noon. Mist forms overnight and burns
off in the first hours of sun, so the curve peaks hard at dawn, returns weakly
at dusk and holds a low floor through the night. A curve symmetric about noon
would be the same shape as the light and would therefore say nothing the light
was not already saying. It takes the scene's own fog colour, so mist and sky can
never be two different weathers in one frame.

**Tuned after the fact, and the tuning found a bug.** The density was set by
eye and read far too thin, so it went up; and the moment it did, dawn on the
Coldwater became a pink-white blanket with the far bank gone. Nothing in the
shader had changed. What had changed is that the POOL WAS FULL for the first
time.

A sheet that leaves the neighbourhood respawns at the RIM, so it arrives already
faded by the distance falloff and drifts in — which is right when you are
walking, because you walk into it. It is wrong when the whole pool leaves at
once, which happens every time the centre jumps: every sheet lands at the rim,
the falloff makes every one of them invisible, and the only thing that can bring
them back is a drift of a fifth of a unit a second. Eighty seconds of empty air,
and every density judgement made in that window was made against a disc that was
mostly not there. Measured on a shown-versus-hidden difference: mean channel
delta 105 before the fix and 228 after it, from the same numbers.

One sheet leaving is a sheet leaving; all of them leaving is a different place.
The count of stranded sheets is what tells the two apart, and a wholesale move
refills the whole disc instead of the rim.

### M54.5 — you can find yourself
Two reports, one shape, and finding out they were the same thing is the whole of
it. *"Should we make players slightly highlighted for better visibility?"* — a
brown-and-leather figure against brown earth is not occluded, it is
low-contrast, and the three mechanisms this project has for visibility (camera
pull-in, building fade, silhouette) all answer occlusion and none answers that.
And: *"I don't like that you see the skeleton of characters when standing behind
objects"* — the silhouette drew as a filled human-shaped cutout in flat pale
blue, which is an X-ray.

Both are asking for the OUTLINE of the figure and nothing inside it.

**The occluded silhouette became a fresnel**, discarding its own interior, so
what shows through a palisade is the shape of somebody standing there rather
than a picture of them. Injected with `onBeforeCompile` rather than written as a
ShaderMaterial, because the rig is skinned and reimplementing three's skinning
would be reimplementing three's skinning.

**The unoccluded highlight is an expanded hull**, and it had to be, because the
fresnel is the wrong instrument for it: a fresnel lights every surface edge-on to
the eye, and on a low-poly rig that is the inside of an elbow, the top of a belt
and the rim of every buckle. Measured on a four-times crop, what it drew was not
an outline but a stipple of specks all over the armour. A hull cannot make that
mistake because it does not know where the eye is.

**And the outline draws AFTER the body, which is the ordering that matters.**
Drawn before, each mesh's hull is erased only by the mesh it belongs to, so
wherever the hood overhangs the neck or a bracer overhangs a forearm that mesh's
own outline survives on top of its neighbour — eleven outlines round the eleven
parts a person is made of, which reads as jewellery. Drawn after, every part has
already written depth and the hull's back faces fail against all of them, so
what survives is only where it overhangs the WHOLE figure. Same shape either
way; the only difference is what it is measured against, and it is the same
class of mistake the silhouette's own ordering note is about.

**And the outline runs OPPOSITE to the pool of light**, which looks wrong
written down and is right on screen. A single opacity cannot serve both ends,
because the line is read against the BACKGROUND and not against the body: at
noon it is a pale edge on a lit figure on lit earth and needs weight to register
at all, and at midnight the same value is a bright line on black, with enough
left over that the seams between the parts of the rig draw too and the character
reads as a chalk sketch. So the outline is strongest by day and the pool of
light is strongest by night, and between them the figure is legible at every
hour without either ever being the loudest thing in the frame.

Plus `presence.ts`: a soft pool of light under every PERSON, warm for you and
cool for other players, scaled by how dark it actually is — almost nothing at
noon in an open field, carrying the whole scene at midnight under trees. A pool
and not a ring, because this game already speaks in ground rings and all four of
them mean something else; another ring would be a fifth dialect of a
four-word language, and it would say "selected" rather than "here".

### Five measurements, and one of them was the ruler
Every visual verdict in this milestone came from a probe, and the probes were
wrong twice before the game was.

- **"The ambience draws nothing."** Wrong. A magenta-pixel counter required
  R>150 and B>150, and a mote at 35% alpha lands at R≈89. The mist got the same
  verdict for the same reason. The test that settled both differences the SAME
  FRAME with the mesh shown and hidden — no threshold to guess — and said 78% of
  pixels changed at the river.
- **"`suits` is being ignored — butterflies in a wood."** Wrong. The
  neighbourhood radius was 2,960 SERVER PIXELS across; a disc that wide centred
  in a wood contains a great deal of meadow. The world is only 400 units square,
  and forgetting which of the two units a number is in is this project's oldest
  recurring bug.
- **The collar rings on the character.** Read as an outline artefact through
  three rounds of tuning. They are the model. Hiding the outline meshes and
  taking the identical crop settled it in one run.

And a fourth, for the harness rather than the game: `tools/patch.mjs` takes a
FLAT ARRAY of `{file, find, replace}`. That is already in `tools/README.md` and
the session guessed instead of reading it, which cost a round to an error
reading `spec.entries is not a function`.
## Phase 55 — One character
User brief: *"Model shouldn't change when swapping weapons. It should be one
consistent, highly customizable, very good quality, rigged, animated character
with all the proper physics and necessities for combat, skills and all the other
things."*

### M55.1 — the body stops changing, and keeps every animation
For eight phases this project has said, in the README and in its own head, that
picking up a staff turns you into a robed mage — and called it the purest
expression of the one rule the game is named for.

**It was a rendering constraint wearing a design decision's clothes.** The kit
ships five characters, and each one is a mesh AND an animation set welded into a
single file. The only sword swing in the project is inside `Warrior.fbx`. The
only bow draw is inside `Ranger.fbx`. `Spell1` and `Spell2` exist nowhere but
`Wizard.fbx`. So holding a sword meant BEING the Warrior, because that is where
the swing was. Nobody chose that; it was the only way to have a staff animation
while the staff animation lived inside the staff character.

### The measurement that unlocked it
All five rigs share **the same forty-four bones, named identically**, and every
clip in every file addresses the same thirty-three of them. Measured before a
line was written, because the whole milestone rests on it and "they look like
the same skeleton" is not a fact — the Wizard even reports 76 bones rather than
44, which is exactly the kind of thing that would have looked like a refutation
from a distance. Its extra thirty-two are robe bones and not one of its clips
touches them.

So the clips can be lifted out of the characters they arrived in. `clips.ts`
loads all five files once and harvests **twenty-five distinct animations** into
one library: every attack, cast, draw, punch, roll, pickup, death, hit reaction,
idle, walk and run a person in this world can perform. One body plays all of
them.

### What a weapon changes now
Everything it changed before except the person. `classForWeapon` still decides
the skill bar, the reach, the mana pool and the damage attribute; the swing
timer still makes an axe land later and heavier than a dagger. And two things
that are new here only because the body swap used to carry them implicitly:

- **The attack clip.** A sword swings, a dagger stabs, a bow draws and looses, a
  staff sweeps, a wand casts. One row per family in `ATTACK_CLIPS`.
- **The stance.** Armed, you stand and run weapon-ready — `Idle_Weapon`,
  `Run_Weapon` — and a bow gets `Run_Holding`, which is the one that carries it
  across the body rather than out to the side. Bare-handed you stand at ease,
  because a weapon-ready stance with nothing in it is a character miming a
  sword.

Three of those rows are judgements rather than lookups. An axe and a mace swing
the SWORD animation, because the kit has no axe clip and the honest alternatives
were to reuse one or to invent one — and the weight is already carried by the
thing that governs it, the attack slot's curtain. A wand casts `Spell1` while a
staff swings `Staff_Attack`, which is exactly right: a staff is a stick you
swing and a wand is a thing you point. And fists take the Monk's `Attack` over
the generic `Punch`, because bare hands are a real archetype here rather than a
broken state.

### And a weapon swap no longer interrupts anything
The old path tore down the entire rig and built a new one, which is why
`buildBody` carries a note about restarting whatever was playing so the
character does not freeze in the bind pose with its arms out sideways. The new
path rebinds six actions on the existing mixer. Position, facing, pose and
momentum survive a swap because there is nothing left for a swap to interrupt.

`Monk` for the body, chosen because it is what a character with nothing in its
hands already was: the plainest silhouette of the five, the only one with
genuinely empty hands, and the one least dressed as a profession before you have
picked one.

### Verified
A probe that swapped through all eight weapon families and asked two separate
questions per family, because "it worked" and "nothing happened" look identical
in a screenshot: is the rig the SAME OBJECT (`instance.object.uuid`), and did
the bound attack clip CHANGE. Eight for eight on both.

Then each attack held at a fixed fraction of its own duration and the bone
bounding box measured, to catch the failure this whole approach risks — a clip
authored against one bind pose played on another comes out bent, stretched or
inside out, and it is not visible at rest. Spans came out 0.5–0.85 wide by
1.5–1.6 tall on a 1.8-unit character, for all six sampled.

Plus a seeded level-40 character in full Enchanted plate with a mace and a
shield, to confirm the procedural armour still fits a body it was never sized
against. Fourteen suites, smoke, both workspaces, zero console errors.

### M55.2 — a wardrobe out of the rigs nobody wears any more
M55.1 pooled the five rigs' animations and left four character models in the
project that nothing loads. They are still carrying their clothes.

Every cosmetic piece in the kit is a mesh parented to a NAMED BONE — the
Warrior's pauldrons off `UpperArmL` and `UpperArmR`, the Rogue's belt and pouch
off `Abdomen`, the Ranger's arm guards off `LowerArmL` and `LowerArmR` — and
those bones exist on the Monk, so those pieces fit the Monk. `wardrobe.ts`
harvests ten of them.

**It was easier than expected, and the expectation is worth recording because it
was the whole perceived risk.** These were assumed to be SKINNED meshes, which
would have meant remapping every vertex's `skinIndex` out of the donor's bone
order and into the target's — the indices are positions in `skeleton.bones`, not
names, so a mismatch renders confetti. Measured rather than assumed, and two
things came back: bone ORDER is identical across all five rigs, 32 skinning
bones in the same sequence, so even a real skinned rebind would need no remap;
and almost nothing here is skinned anyway. A pauldron does not deform. It sits
on a shoulder and turns with it, which is a rigid mesh on a bone.

### Two coordinate systems, and the failure is not a coordinate failure
Everything `gear.ts` generates is authored in the model's REST FRAME —
`[0, chestMid, -4]`, absolute positions on a standing character — and
`Actor.holderFor` exists precisely to hang that off a bone with the bone's own
transform undone. Everything harvested arrives the other way round: it was
already a child of its bone and carries the local offset that put it there.

Sent through the holder it is offset twice, and what that looks like is not a
coordinate bug — it is a pauldron floating a metre from a shoulder, which reads
as a bad asset. So `GearAttachment` carries a `boneLocal` flag and the two
spaces are kept apart by the piece saying which it is in.

### The kit calls it a cloak and it is a hood
`Cloak`, in `Ranger.fbx`, parented to `Head`. The parent bone is the tell — a
cloak hangs off the shoulders — and attaching it to the Monk and looking settled
it in one frame: a cowl over the skull with the fabric falling at the back, at
exactly the size a hood wants, because it was authored against the same head
bone. It is called `hood` here. Carrying the kit's name for it would have filed
it under the cape slot and left somebody wondering, some phase from now, why the
cape was on the character's head.

That is the whole argument for the contact-sheet probe that found it: ten pieces
attached to the body one at a time and photographed. Names in an asset pack are
the pack's, and this project has been wrong about one before.

### What is harvested and what stays generated
Only where the kit's version is plainly better. The Warrior's shoulder plate has
a rolled lip and a bevel that no arrangement of a dome and a shell reaches, so
plate, scale and brigandine take it. Robes take the Wizard's little folded
shoulder caps, which are a robe's shoulders rather than armour's — a distinction
the heavy pair cannot make. Leather takes arm guards, a belt and a pouch, and
between them those four small pieces do more for "this is somebody who travels"
than any amount of chest geometry.

Everything else stays generated, because for a cuirass, a tasset and a mail
skirt it is the other way round, and a downloaded part that is worse than the
thing it replaces is a downgrade with provenance. Every fallback is still in
place: a donor that fails to load costs its piece and nothing else.

### And a body coloured from its owner's name
One body for everybody has one obvious cost — a crowd at a resource node is five
copies of the same person — and gear only covers players who have some.

So the body is tinted from the character's NAME, and choosing that over the
obvious alternative is the decision worth keeping. The obvious alternative is a
character creator: sliders, a stored identity, a column in the database, a field
on the wire. This needs none of them. A name is already unique, already
persistent, and already known to every client that can see you, because the
nameplate is drawn from it — so a tint derived from it is stable across
sessions, agreed on by every observer, and costs zero bytes and zero schema. It
is also, unlike a random seed, something the player CHOSE.

### The amplitude took three passes and each failure was informative
The Monk's skin and its robe are one texture on one material, so there is no
tinting one without the other and a wide hue wheel makes a green person with a
green face.

- **First pass: one HSL colour, multiplied.** Four names came out `#d7bb99`,
  `#e8bfa3`, `#d3b29d`, `#d6bea8` — within ten values of each other on every
  channel. An HSL colour at L=0.5 with low saturation is a mid grey with a hint,
  and four mid greys over one texture are four of the same thing. The knob had
  been turned and was not connected to anything.
- **Second pass: normalise the tint to a mean of one, then scale.** Correct in
  principle — hue and saturation change the cast at constant brightness, value
  gets its own axis with a real range — and the range was set to 1.28, against a
  base colour that is already 0.78 of white. Every character clipped to the same
  near-white. The identical failure as the first pass, reached from the other
  side: a knob with a range wider than the thing it drives has no range at all.
- **Third: 0.48 to 1.02.** And verified over THIRTY names offline rather than
  over the four that happened to be in the probe — those four had hashed to
  0.60, 0.75, 0.60 and 0.66 and would have condemned a working distribution.
  Across thirty it is 0.49 to 1.02, near-uniform across six buckets.

### Verified
The contact sheet, the four-name comparison, five armour styles photographed on
one character, and M55.1's eight-family swap probe re-run to confirm the
animation work is undisturbed. Fourteen suites, smoke, both workspaces, zero
console errors.

### M55.3 — feet on the ground, and there were two reasons they were not
Reported from play: *"Characters feet are slightly in the ground"*. Two
independent causes, both small, both permanent, and neither visible in a still
frame at normal magnification.

### One: the seat is measured in a pose nothing ever stands in
`instantiate` seats a model by its bounding box and drops it so the lowest point
sits on y=0. That is the only thing it CAN do — it is handed a model and no
animation — and it is exactly right for the pose it measures, which is the bind
pose.

No clip is the bind pose. Measured across all twenty-five, holding each at
twenty-five points through its own duration and skinning every ninth vertex by
hand:

    Idle          0.0000     <- what the seat was tuned against
    Idle_Weapon   0.0000
    Run           0.0137
    Walk          0.0381     <- and this is the state you are in most
    Roll          0.0760
    Death         0.1305

Idle matched to a ten-thousandth, which is why the first measurement said the
feet were fine. Walking put the sole four centimetres into the ground on a
1.8-unit character, permanently, everywhere.

The fix is a lift, and **which clips it is measured over is the whole
decision**. Only the ones in which the character is STANDING. `Roll` and `Death`
reach lower than any of them and must not be included: a body on the ground is
supposed to be on the ground, and lifting the rig until a corpse's shoulder
cleared the grass would raise the character in every other state to fix the one
state that was already right. Cached per model, because it is a property of the
asset — forty characters on one rig ask once.

Sampling density turned out to matter and in the dangerous direction. Every
ninth vertex at twelve points found 0.029 where a finer scan found 0.038, and
an under-report is nine millimetres of foot still in the floor. Every third
vertex at twenty points now, paid once.

### Two: the feet stood on the field, and the eye sees the mesh
`terrainHeight` is a smooth analytic function. The ground is that function
sampled on a 1.63-unit grid and joined up with flat triangles — and a chord is
not the curve it spans. Across a hollow the triangle rides ABOVE the true
height, so a character placed at the true height is inside the ground you can
see.

Measured over forty thousand points: the drawn ground is above the field across
**24% of the world**, by up to 0.14 units — eight per cent of a character's
height. The median is zero, which is exactly why this reads as "sometimes the
feet are slightly sunk" rather than as a constant offset, and why it survived
eight phases of being looked at.

`drawnHeight` reproduces the mesh's own triangulation — `PlaneGeometry` splits
each quad (a,b,d)(b,c,d), so the diagonal runs corner to opposite corner, and
getting that backwards is invisible on a flat quad and wrong by the full sagitta
on a steep one — and `surfaceHeight` returns it. The span and segment count
moved to two constants that `buildTerrain` and `drawnHeight` both read, because
two copies of a grid resolution is a bug with a delay on it: the day somebody
changes the segment count, the feet stop agreeing with the floor and nothing
says why.

**This is M54.1a's lesson one level down.** That fixed three opinions about
where the ROAD is. This is two opinions about where the GROUND is, and the fix
is the same shape: the thing you stand on and the thing you see have to be one
answer.

### Verified
Every clip re-measured after both fixes. No upright pose sinks: `Walk` sits
2.7mm above the ground where it was 38mm below, and `Idle` clears it by 41mm —
which is the trade a single lift forces, and it is the right way round, because
a foot two pixels above grass with a shadow under it reads as standing while a
foot two pixels into grass reads as broken. `surfaceHeight` and `drawnHeight`
now differ in exactly the thirty samples out of thirty thousand that are the
bridge deck. Then the foot cropped at nine times magnification, mid-walk, with
the sole visibly on the grass and the toe clear of it.

### One more note for the harness
Three crops in a row missed the character entirely, and the reason is worth
keeping: the probes drove `world.follow(actor.position...)`, and after a
teleport the ACTOR is still interpolating toward its new position — so the
camera was chasing a moving point that had not arrived. Headless throttles rAF
to about 1fps, which makes the transit last many frames rather than a few
milliseconds. Drive the camera from the TARGET — `toWorldX(playerX)` — and snap
the actor with `snapTo` first. Same family as the existing note that a
screenshot forces a render but not the easing.

---

## Phase 56 — The ground under your feet
Both halves were written down at the end of Phase 55 as follow-ups, and they are
one milestone because they are one complaint: *the feet are geometrically
planted and they do not look it.*

### M56.1 — a lift per state, and something under the body
M55.3 fixed a real fault — the rig is seated in the bind pose and stands in a
clip, so walking put the sole four centimetres into the ground — and it fixed it
with ONE lift for the whole rig, taken as the worst case over every upright
clip. That is the right trade to make in a hurry and the wrong one to leave
standing, because the worst case is `Walk` and the cost is paid in every other
state: an IDLE character, which is what you are looking at most of the time you
are looking at all, hovered 38mm above the grass permanently. A sunk foot was
traded for a floating one.

### The lift is per state, and per CLIP rather than per frame
A lift per animation state costs nothing at runtime and is exact in each one:

    Idle_Weapon           lift 0.0000    clearance 0.0000
    Walk                  lift 0.0456    clearance 0.0000
    Run_Weapon            lift 0.0141    clearance 0.0000
    Sword_Attack          lift 0.0007    clearance 0.0000
    RecieveHit_Attacking  lift 0.0004    clearance 0.0000
    Death                 lift 0.0000    clearance -0.1408

Two of those rows are the interesting ones. `Sword_Attack` and `RecieveHit` were
never in the old measurement at all — the single constant was measured over
seven standing clips and then applied to every state — so an attack and a
stagger floated the full 38mm as well, which is most of a fight. And `Death` is
supposed to be negative: a body on the ground belongs on the ground, so `die` is
exempt and gets a lift of zero.

**The obvious next step is a lift sampled THROUGH each clip, and it is wrong.**
It would put the lowest vertex exactly on the ground at every instant, which is
precisely the statement that a run has no moment with both feet off the ground.
The rule is that nothing may go BELOW the ground, not that something must always
be touching it — so the per-clip minimum is the right resolution and a finer one
is a regression wearing a precision badge.

The blend is the mixer's own weights applied to the per-state lifts, so a
crossfade is correct for free: measured at the half-way point of a 180ms fade
from idle into a walk, the seat is 50% of the way across. Easing it separately
would be a second copy of the blend, and the drift would be a foot skimming the
grass for a fifth of a second every time somebody set off.

### And the ruler was under-sampled on the OTHER axis
M55.3 found that every ninth vertex under-reported a clearance where every third
did not, fixed the vertex axis, and left the time axis at twenty-one points.
That is where the rest of the error was living:

    Walk, every third vertex, at N points through the clip
      21 points   0.0408      <- what M55.3 shipped
      81 points   0.0451
     161 points   0.0456
     321 points   0.0456

Five millimetres of foot, permanently, in the one state you spend most of your
time in. Every other clip is flat from twenty-one points, which is exactly why
it survived: the number is only wrong for the clip whose sole passes through its
lowest point quickly. Every third vertex against every vertex agrees to four
decimal places, so the vertex axis really was already fine.

A straight 161-point scan costs about 220ms a clip, which is a visible hitch on
a weapon swap. So the scan is split by the observation that the deepest point of
a walk is the SAME FEW VERTICES throughout — the sole of whichever foot is down.
A coarse pass in time over every third vertex names the sole; a fine pass in time
evaluates the sole alone. 40–55ms a clip, once per model and clip.

### Two: a contact shadow, which is not the shadow there already is
Every actor casts into the sun's 2048px shadow map and has since Phase 47, and
that is not this. A cast shadow says where the LIGHT is: at noon it is under the
feet and at every other hour it is a streak lying ten units away, so the place
the eye actually checks has nothing under it. What was missing is the other
thing — the ambient light a body keeps off the ground it is sitting on, which
does not care where the sun is and is what says *these two surfaces are
touching*.

- **It multiplies, it does not paint.** `presence.ts` is additive because it is
  light falling on the ground; this is the opposite. A dark quad blended
  normally is a grey decal lying on the grass and looks like one at every
  opacity; the grass has to survive underneath it, darker.
- **It is under EVERYTHING** — players, monsters and townspeople. `presence` is
  deliberately players-only because it answers "which of these figures is mine".
  This answers "is this thing touching the floor", and a wolf's feet are as
  unanchored as yours.
- **It is sized from the body radius the game already collides with**, so the
  shade and the footprint cannot disagree about how much room a creature takes
  up. Same argument `bodies.mjs` makes about hitboxes.

### The strength is constant, and the first version charged twice
It was scaled by the hemisphere fill's own intensity, on the reasoning that
occlusion removes ambient light and there is less of it at night. True, and
already paid for: a multiply takes a fraction of whatever is on the ground, so
darker ground loses less in absolute terms without anybody arranging it. Scaling
the strength as well made it *absent* at midnight rather than weaker — measured
at a peak channel delta of zero.

Which puts three mechanisms under a figure running on three different schedules,
and they do not overlap: the sun's shadow map is where the light is, the pool of
light is strongest at midnight, and the shade is a fixed fraction of whatever
the ground already had.

### A flat mark on ground that is not flat is mostly inside the hill
The patch drew a clean 1% of its box on grass and **exactly nothing** on
Emberhold's paving, from the same code in the same frame. Two separate causes,
and both are lessons this project has already written down once.

**The ground is not flat, and a horizontal quad is a chord across it.** Measured
over nine hundred positions, for a quad 1.32 units across:

    the ground rises above a FLAT quad seated at its centre    median 0.086
    the ground rises above a quad TILTED to the local slope    median 0.003

Sixty per cent of the patch was inside the terrain, and the depth test was
throwing it away. This is M55.3's own lesson one more level down — there it was
the terrain mesh riding above the field it was sampled from and the cost was a
foot in the floor; here it is a decal riding through ground that rises under it.
`layOnGround` takes four height samples and tilts the quad, which removes
essentially all of it; what is left is curvature, and a 35mm lift covers the
ninety-fifth percentile of that. **The pool of light had exactly the same defect
for exactly the same reason** and has been on the same footing since.

**And Emberhold's paving is a transparent decal that writes no depth.** It draws
at render order 2, so a shade at 1 was drawn and then painted over by the
cobbles. Order 4 puts the shade over the road, the paving and the flagstone
island; the pool of light moved to 5, because light falls ON shaded ground; and
the mist moved to 6, because mist is air standing in front of all of them — it
had been at 2, alongside the paving it should always cover.

### Verified, and the probe was wrong before the game was — twice
- **"The patch changes 9.6% of the frame."** The game loop was still running, so
  the two screenshots differed by the wind, the mist, the flames and the
  butterflies. A difference image across a live world is a picture of the
  weather. The loop is stopped first now.
- **"The patch is drawn four hundred pixels from the character."** It was. The
  camera's distance is a stored PREFERENCE, so a fresh browser profile framed
  the scene differently from the one the crops were written against, and the
  probe measured a clean difference of somebody else's feet. It pins the zoom
  now, and — the check that would have caught it in one run — it projects the
  character and refuses to measure anything until it is confirmed in frame.
- **And the ruler was in the wrong units.** A multiply is a RATIO, and absolute
  channel delta under-reports on dark ground by exactly as much as the ground is
  dark. Measured as a fraction of what was there, the deepest point of the mark
  takes the ground to 52% at noon in a meadow and 58% on the paving.
- Dawn and midnight are recorded rather than gated: at midnight there is almost
  no light under a figure to take a fraction of, and at dawn the mist lies over
  the mark — which is correct, and is why the pool of light runs the other way.

Two things `__wieldboundRules` now carries, for the same reason everything else
on it is there: `surfaceHeight` and the two server-pixel conversions. A probe
that keeps its own copy of where the ground is measures its own idea of where
the ground is, and this project has spent rounds on that three times.

Fourteen suites, smoke, both workspaces, zero console errors.

---

## Phase 57 — A world you can hear
Sound has existed in this project since Phase 39 and has never been a PLACE.
Twelve baked cues fire when something happens — a swing, a hit, a level-up — and
between them the world is silent. That is the loudest remaining thing saying
*this is a screen* rather than *this is outdoors*, which is the same sentence
M54.1 wrote about grass that had never moved, one sense across.

### M57.1 — the soundscape
Six beds, and every one of them a pure function of WHERE you are, WHEN it is,
and how hard it is blowing.

**Derived, not sent**, for the third time and for the same reason the hour and
the wind are: sound drives nothing the server resolves, so a message carrying it
could arrive late or drift between two people standing in the same field. All
three inputs are already agreed on by every client without a byte crossing the
wire, so the soundscape is too.

**It reads the same tables the fauna does.** `forestStrengthAt`, `riverAt`,
`nightAmount` — the questions the butterflies and fireflies already answer. A
wood at dusk has been a visibly different place to stand in since Phase 54;
asking the same questions here is what stops it being audibly somewhere else.

**And it is synthesised**, like every cue, every town texture and every
building. The argument is Phase 49's about a downloaded building standing in
front of Quaternius pines: a field recording of English woodland would arrive in
a different stylisation from the chiptune blip a sword makes, and would be
megabytes for a bed that is four filters over one buffer of noise.

### What the six are, and what each one had to get right
- **Wind.** Pink noise through a lowpass whose CORNER OPENS with the gust as
  well as its level rising. Level alone reads as somebody turning it up;
  measured, the band above 1.6kHz goes from −127dB in a calm to −92 in a blow,
  which is the part that makes it weather.
- **Gust.** A narrow band over the top, cubed against strength so it genuinely
  only exists in the top of the range. Linear, it is present at every strength
  and therefore says nothing.
- **Leaves.** The same air two octaves up, and it is a PAIR with the wind rather
  than an addition: the open wind drops as the canopy closes and comes back as
  leaves, so walking into Blackstand is a change. Measured at 8dB brighter than
  open ground in the same wind. Same shape as the butterflies handing over to
  the fireflies at dusk.
- **Water.** A band rather than a hiss — everything under 300Hz is a rumble the
  Coldwater does not have and everything over 2k is rain. 28dB over an open
  field standing on the bank.
- **Fire.** A low roar, read off the SAME tables the flames are placed from —
  the braziers and the smithy out of `shared/town.ts`, the torches out of
  `shared/road.ts`. A registry populated by whatever draws them would be a
  second list that agrees on the day it is written. Braziers and torches are
  weighted by NIGHT, a fade rather than a threshold, so nobody keeps a second
  opinion about the hour the lamps come on; the forge burns at every hour,
  because there is a smith standing at it at every hour.
- **Crickets.** Three gated tones, and the GATE is the whole thing — a cricket is
  not a pitch, it is a rate, which is why a square wave driving a gain sounds
  like one and a tremolo does not. Three voices at rates that are not multiples
  of each other, so the chorus drifts in and out of phase with itself for ever.
  31dB at 4kHz, in a band nothing else in the game occupies.

And **birdsong is not a bed**, because a bird is a thing that happens with
silence either side of it, and the silence is most of what makes it read as one
bird somewhere rather than as an atmosphere track. Poisson gaps rather than a
jittered interval, because a jittered interval still has a beat in it. Two
calls: a fast rising trill in the open and a slow two-note in a wood, which is
the same distinction the fauna table draws.

### The cues moved onto the same graph, and that was the point
`sfx.ts` was twelve `HTMLAudioElement`s with a round-robin pool of four per cue,
because one element can only play once at a time. Decoded into buffers on the
shared context, the whole pooling mechanism goes away — a buffer source is
created per play, so there is no such thing as interrupting one.

The reason for moving is not tidiness. **`M` has to silence the world as well as
the cues**, and two subsystems with two independent volumes is a mixer with a
bug in it: one of them would keep playing. One master gain rules both, with a
cue bus and an ambient bus under it, mixed against different things — a cue is
an event the player caused and has to land, and the world is a floor that must
never be the reason a hit is not heard.

### Three numbers that are load-bearing
- **The follow time is 0.75s**, and it is the most important constant in the
  file. A bed that tracked position tightly is a volume knob turning as you
  walk, which the ear hears as a mechanism; at three quarters of a second the
  river simply gets closer.
- **Every ramp is guarded against not moving.** `update` runs from the render
  loop, so an unguarded version schedules six automation events a frame for
  ever — and an AudioParam's event list is a list. Standing still is the common
  case and it costs nothing now.
- **The noise buffer's loop seam is crossfaded.** Four seconds of pink noise
  looped end to end clicks, and a click every four seconds is a metronome nobody
  can find.

### Verified by measuring the bus, because there is nothing to look at
An audio graph is the one part of this project with nothing on screen, so
`__wieldboundAudio` exposes the busses and the probe taps an `AnalyserNode` onto
them. The beds are driven with synthetic `Listening` values rather than by
walking the character around — which is exactly what that argument being pure
buys. Level and four bands, per place and per hour:

    meadow, calm, noon        rms 0.0044   low -77  mid -98  high -127  4k -131
    meadow, blowing, noon     rms 0.0212   low -64  mid -70  high  -92  4k  -97
    wood, blowing, noon       rms 0.0167   low -67  mid -72  high  -85  4k  -87
    the Coldwater, calm       rms 0.0180   low -68  mid -69  high  -84  4k  -88
    meadow, calm, midnight    rms 0.0083   low -77  mid -94  high  -94  4k  -81
    brazier, calm, noon       rms 0.0050   low -76  mid -92  high -116  4k -111
    brazier, calm, midnight   rms 0.0211   low -67  mid -76  high  -92  4k  -81

Plus: the ambient bus at zero measures exactly zero; `M`, pressed through the
real key handler, takes the master to 0.00009; and `playSfx("hit")` peaks at
0.33 on a cue bus that is silent otherwise, which is the check the migration
actually needed. The Play button unlocks the context with no autoplay flag, so
what the probe measures is the path a player takes.

### And a fifteenth suite, for the failures that are silent by construction
`tools/test/soundscape.mjs` checks the WORLD the beds read rather than the sound
they make, because that is the half a browser cannot check and every failure of
it is an absence rather than a fault:

- every named wood's canopy clears the threshold the wood's own birdcall
  branches on, over at least a quarter of its disc and not merely at its exact
  centre — otherwise one of the two calls plays nowhere and nothing says so;
- Emberhold can hear a fire from every point inside the palisade at every hour
  (the forge is 330px from the square, worst case 1049 of 1200);
- the road never runs further than 287px from a torch, so the chain of fires
  going north is audible as well as visible;
- and the Coldwater is NOT audible from the town square (3,233px away against an
  audible radius of 1,850) while it IS audible standing on the bank — the second
  half being the one that would fail if the range were ever tuned down to fix
  the first.

The thresholds are parsed out of `soundscape.ts` rather than restated, the same
way the waystone test parses the server's own camp table: a copy agrees on the
day it is written and stops agreeing the first time somebody retunes a range,
which is exactly the moment this test has to fail.

Fifteen suites, smoke, both workspaces, zero console errors.

### M57.2 — the air was six times too thick, and a bird was three times too big
Reported from play, and for the second time: *"there are still too many
butterflies around"*. M54.2 had already answered exactly that complaint, and
what makes this worth writing out is that **the fix made it six times worse
while every individual number in it was argued for in writing.**

### What happened
M54.2 did two things in one milestone.

- It cut the butterfly pool from 150 to 62, because forty on screen read as a
  hatch rather than as a meadow.
- It cut `RADIUS` from 74 to 26, because a 74-unit disc is seventeen thousand
  square units and most of it is never looked at.

Each of those is right on its own and the milestone defends both at length. What
nobody did is the arithmetic BETWEEN them: the disc got eight times smaller
while the count only halved, so the density went up by a factor of six. The
milestone's own note — *"26 is roughly what the camera can see, so the pool is
spent where it is looked at"* — is what turns that into the visible fault, and it
is understated: at that radius the whole neighbourhood projects inside the
viewport, so the pool size **is** the on-screen count and there is nowhere for a
surplus to hide.

**And there are two butterfly kinds.** Every sentence in M54.2 reasons about
"62". The cabbage-white's 34 was never once added in. So the number the player
was looking at was ninety-six in a disc the camera sees all of.

Measured, before anything was changed: **ninety butterflies on screen at once**
in an open meadow at noon, against forty that had already been reported as too
many.

### The fix is a density, not a smaller number
A pool is declared as a count per thousand square units of the neighbourhood
now, and the headcount is derived from `RADIUS`. That is the call `PLAN` already
recorded for the treeline and the ground cover — *"scenery counts are densities,
not headcounts, so the next time the world is resized it does not silently thin
out"* — arriving in this file three phases late, and it is the only version of
the fix that could not have been made wrong the same way.

Twenty on screen now. The band is bracketed by two measurements rather than by
taste: three was photographed in M54.2 and read as an empty field, and ninety
was reported from play.

### And then the measurement found the bird
The probe that counted what was on screen was extended to ask how BIG each of
them was, from the real geometry rather than from the `size` field — which is a
scale factor and not an extent. In the same frame, at the default zoom:

    butterfly        14 on screen      6 px across
    cabbage-white     7 on screen      5 px
    bird              4 on screen     73 px across, 106 at worst
    (the player)                      28 px tall

**A bird was three times the height of the character.** The comment above it
said *"bigger than the rest and still small on screen: a bird up here is a dozen
units further away than anything else in this file"* — which is arithmetic
nobody did. The camera sits forty-six units out, so a dozen units of extra
distance costs about a quarter of the apparent size, not an order of magnitude.
What it drew was a flat black chevron the size of a hang glider lying in the
grass, and it is in every meadow screenshot this phase took, including the ones
used to sign off the contact shadow.

Down to about eighteen pixels: bigger than a butterfly beside you and
unmistakably further away, which is the whole relationship the two are meant to
have.

### A sixteenth suite, for a rule the file already stated and never enforced
`ambience.ts` opens by saying that nothing in it is *"larger than a fist"*. That
was the rule the whole time. `tools/test/ambience.mjs` asserts it, plus the
things that would let this happen a third time:

- **no kind may be declared as a headcount** — one `count:` added in review
  reintroduces the exact bug, and it would look perfectly reasonable;
- **no kind's size may exceed 0.5 units**, well under a character's 1.8 rather
  than merely under it, because these are the things a player must never mistake
  for something that matters — the same argument that keeps the ground cover
  from resembling a resource node;
- **and the two flutterers are counted TOGETHER**, which is the check that would
  have caught the original defect, since the whole failure was that one of the
  two pools was never in the arithmetic.

Sixteen suites, smoke, both workspaces, zero console errors.

### M57.3 — a trench at each abutment, and the height field finally gets a test
Reported from play: *"look at the gap between the north bridge and dirt path
again"*. The word doing the work is **again** — this is the third time the
crossing has been reported, and all three are the same class of fault.

### What it was
Sampling `surfaceHeight` every 25 pixels along the road, with the deck at 0.426:

    along  -350     0.410
    along  -325     0.050    <- a 0.38 notch at the south abutment
    along  -300     0.426
    along  ....     0.426    (the deck)
    along  +300     0.426
    along  +325    -0.849    <- a 1.27 TRENCH at the north abutment
    along  +350    -0.335
    along  +400     0.366

A ditch immediately off the end of the planks, seventy per cent of a
character's height on the north side, asymmetric only because of where the
terrain grid's vertices happen to fall on each side. And because the road ribbon
samples the same heights per vertex, the dirt dived into it too — which is
exactly what read from play as the track stopping short of the bridge and
picking up again further on. The gap was not in the ribbon; the ribbon was
faithfully drawing a hole.

### Why
M54.1a moved the approach ramp into the height field, which was right and fixed
the crossing's first two faults. What it left behind was a BRANCH:

    if (along <= BRIDGE_HALF_SPAN_PX) return h;

Under the deck, the ground stayed whatever `carveRiver` had cut — riverbed. Just
outside it, the ramp started at deck height. So the height field stepped, in one
pixel, from the bottom of the channel to the top of the ramp.

**A height field may not step.** The thing you see is a MESH sampled off it on a
1.63-unit grid, and a mesh cannot draw a step — it draws a wedge across whichever
quad the step falls in. That is M55.3's lesson (the drawn ground is not the field
it came from) meeting a discontinuity, and the product is a trench.

### The fix is that there is no branch
The bridge is 640px long and the water is 300px wide, so the deck overhangs the
bank by about 170px at each end. That overhang is an **abutment**: solid ground
at deck height, which is what a bridge lands on. This file already said the deck
"only has to span the water and land on the slope either side" — now the ground
says it too.

One expression covers the channel, the landing, the ramp and the open field:

    rise    = min(landing, climb) * shoulder
    raised  = h + (deck - h) * rise

where `landing` rises from nothing at the waterline to everything 130px clear of
it, `climb` is full at the abutment and gone at the foot of the ramp, and
`shoulder` tapers the causeway back to the land across its width. There is
nothing left to be discontinuous. Worst step along the whole crossing is 0.03,
down from 1.27; the two abutments now join to within 14mm and 4mm.

### And the height field is testable now, which is the durable half
Three defects, all reported by a person walking into them, and **not one could
have been caught by anything in `tools/test/`** — because `terrainHeight`,
`drawnHeight` and `surfaceHeight` lived in `World.ts`, which pulls in three.js, a
renderer and a DOM. Node cannot load that, and the client's extensionless
imports mean Node cannot load any of it without a resolver hook.

So the height field is `client/src/three/heightfield.ts` now: 520 lines of
arithmetic over the tables in `shared/`, no three.js, no DOM, and shared imports
written with explicit `.ts` extensions — which Vite does not care about and Node
requires. `World.ts` re-exports every name, so no call site had to learn it
moved. It stays in `client/` rather than moving to `shared/`, because the
decision that made height free in the first place — *nothing in the simulation
reads a Y* — is what keeps it out of the server. Making it testable must not
make it authoritative.

`tools/test/crossing.mjs` walks it. What it asserts is CONTINUITY rather than
any particular shape: the land may be whatever it is, and what it may not do is
jump.

### The ruler was wrong first, in the usual direction
The first version asserted on the height difference between consecutive samples,
and it failed — on the north bank, which climbs a steady 0.19 units every 25
pixels for hundreds of pixels. That is an eighteen-degree hillside and it is
supposed to be there. **A step is not a slope**, and a threshold low enough to
catch a trench is low enough to ban hills.

What a step actually is, is a discontinuity, and a discontinuity lives in the
SECOND difference — flat for any slope however steep, spiking for any break
however short. The trench scores 1.79; the land, measured across the whole
crossing and the whole road, never exceeds 0.08. A separate, much looser check
still catches an outright cliff.

Five checks, and the one that would have caught this on its own is the simplest:
*the height five pixels inside the abutment and five pixels outside it must be
the same number.* Reverting `rampToBridge` to its old form fails six of them, so
the suite tests the game rather than restating it.

### M57.2's other half — music — is parked
User call: *"Let's plan it for later."* The soundscape is the half that makes the
world a place; music is a different feature with a different set of decisions
behind it (when it plays, when it stops, whether combat has its own, whether it
is derived like everything else here or authored). It waits for its own
milestone rather than being bolted onto this one.

---

## Phase 58 — What it folds to
Damage has had a school since Phase 48 M4, and it is the deepest system in the
combat design: six schools, thirteen creatures each with something that hurts
them, five elemental palettes, five elemental spells, resistance suffixes, a
target frame that says what the thing in front of you folds to before you
commit, and a log line that says *"you burned the Wolf for 9 — it feels that."*

**And nothing in the world had ever asked anybody to use any of it.** A player
could take all eleven quests in Emberhold, finish all eleven, and never once
learn that a troll knits itself back together unless you burn it. That is the
same dangling limb `salvage` was before *Take It Apart* — a system the game
owns, resolves and draws, and never points at.

### M58.1 — a third giver, and the only work in the game that says HOW
Five quests, one per element, from Elsbet Vane.

### The objective is a technique, which no other objective is
Every other verb in `shared/quests.ts` counts something the player was going to
do anyway and points them at WHERE to do it — a kill the threat table credited,
a gather the server resolved, a forge it charged for, a place you walked to.
`slay` counts HOW.

    { kind: "slay"; monster: MonsterKind; school: ElementalSchool; count: number }

**The school is an element and never physical.** Physical is what a blow is when
nothing has an opinion about it, so "slay it with physical" would be satisfied by
accident by most of the characters in the game and would teach exactly nothing.
The test asserts it rather than the type alone, because the type is only as good
as the next person who widens it.

### "Killed it with" means MOST OF IT, and the other two answers are worse
This is the whole design and it is one function:

- **The killing blow.** Wrong, and not marginally. Combat here resolves on a
  swing timer, a dot ticks on its own clock and a volley lands over half a
  second — which blow happens to be last is the one thing in a fight the player
  does not choose. A quest keyed on it is a dice roll wearing a technique's
  clothes.
- **Any of it.** One firebolt inside a thirty-second sword fight, and the
  counter moves. It asks for nothing, so it teaches nothing.
- **Most of it.** The school that did the largest share of YOUR damage to that
  body. The objective is satisfied by FIGHTING AS that element rather than by
  garnishing a fight with it, which is the lesson — and it is the loot rule one
  level down, since the same accumulated-damage table already decides who a drop
  belongs to by asking who did most.

So the threat table grew a companion split by school, keyed and cleared exactly
alongside it, and `addThreat` takes the school as an optional fourth argument.
**Optional rather than defaulted to physical**, because the one caller that
passes nothing is the token point a debuff adds for acquiring a target — and
that is not damage. Recording it as physical would let somebody who marked a
thing and then burned it to death be credited with a physical kill on a
one-point tie.

A burn carries its own school, and it has to: `Immolate` lands small and deals
most of its damage as ticks, so a dot that did not would make the one skill
built for burning things the worst way to be credited with burning one.

### The rule moved to `shared/` before it was tested, not after
`dominantSchoolOf` started inside `index.ts` and was lifted out, which is M57.3's
lesson applied without waiting for three reported defects first. It is a rule of
the game in exactly the sense every formula in `protocol-types.ts` is one, the
server was its only caller and therefore the only place it could be wrong, and
nothing offline could reach it there.

### Elsbet is the right person, and "has work" is a fact of the table
She has had the topic since Phase 49 — *"What is damage made of?"* — and has
been answering it into the air ever since. A herald who states a rule and then
hands you the work that proves it is one character doing one job. The
alternative was Cabel, whose entire voice is distance and who would have had to
start explaining resistances.

The client used to decide who has work with `role === "quest"`, which is a second
opinion about the same thing and was wrong the moment a guide was given a line.
**`role` says what a person IS and `questsFrom` says what they have** — Elsbet is
still a guide, still has the guide's portrait and plate, and now has five
quests. Same call this project makes about where the fires are: read it off the
table that owns it rather than keeping a register beside it. The server never
checked a role at all, so it needed no change.

### The five, and why each pair
One per element, walking outward, each pair a real vulnerability in
`MONSTER_STATS`:

    The Wing Is The Animal   4x Armabee    band 2   frost      -30%   from level 5
    What The Coat Is For     4x Wolf       band 3   fire       -30%   from level 8
    A Great Deal Of Blood    3x Orc Brute  band 3   nature     -30%   from level 11
    Nothing To Cut           3x Ghost      band 4   arcane     -40%   from level 15
    The Seam                 2x Golem      band 5   lightning  -45%   from level 20

**One per element is the shape of the claim.** `protocol-types.ts` says of the
five that every one has "a monster that resists it, a monster that folds to it, a
way for a player to deal it and a way to defend against it". Four of those were
true and the fifth — a reason to ever deal it — was not. Now the sentence is true
in the quest log too, and the test fails if an element gains a second quest while
another has none.

**And they reach past band 3, which no other quest does.** That is the point of
them rather than an oversight: the technique is what makes a far creature
tractable, and a line that stopped at band 3 would never get to the one with
lightning for a seam. The second quest is deliberately the reverse of the first —
a wolf's coat turns cold the way armour turns a blade — because *the thing that
worked last time does nothing here* is the half of the system everybody misses.

**The tracker's label is derived, not written.** `SCHOOLS[school].verb` already
exists and the combat log already reads it, so the tracker says "Armabees
chilled 4 / 4" and "Golems shocked" out of the same table. Five per-quest strings
would have been five chances for a fire quest to say "frozen".

### Four ways this can lie, and a check for each
Every failure here is the game telling the player something untrue **in its own
voice**, which is strictly worse than the silence this milestone exists to fix.
None of them throws.

- **A pair that is not a real weakness.** "Burn the demon" is a quest that can be
  finished and should never have been offered, and it is exactly what a retune of
  one row of `MONSTER_STATS` produces silently. The test reads the real resist
  table and demands a negative number — zero is not enough, because sending
  somebody at something with no opinion either way teaches that the system does
  nothing.
- **A school nothing can deal.** Nature has exactly ONE weapon in the whole
  catalogue and it is band 5, so this is live rather than hypothetical: the
  answer there is Poison Arrow, and if that skill were ever moved or retyped the
  quest would become impossible. The test counts the ways out of the real
  catalogue and the real skill table.
- **A brief that never names the element.** The player cannot see the rule the
  objective is enforcing, so "Wolves burned 0 / 4" after four dead wolves reads
  as a bug rather than as an instruction.
- **An element with no work behind it**, which is the check that would catch a
  sixth school being added the way the fifth nearly was.

### The ruler was wrong first, twice, in the usual direction
- **The brief check passed a brief with the element deleted out of it.** It was a
  bare substring, and *"a staff learns a firebolt"* contains "fire" — so the
  assertion was being satisfied by a spell name rather than by the instruction it
  was written to enforce. Every element in this game is a prefix of one of its own
  spells (firebolt, frostbolt, stormbolt), so this is the normal case and not a
  corner of one. Word boundaries now, and the mutation fails.
- **The live probe asserted "+1 per kill" and failed against a working game.**
  This is an auto-battler: an attack order stands until you walk away, so a phase
  kills however many armabees it kills and the exact number is not the probe's to
  know. Worse, the first run never equipped the mace at all — *"you cannot hold it
  and an off-hand"* — so the phase meant to prove lightning does not count was
  fought bare-handed. It asserts the SIGN now, and it reports which schools it
  actually dealt, so a phase that fought with the wrong thing says so instead of
  passing.

### Verified
`tools/test/slaying.mjs` is a live-socket suite in the same mould as `smoke.mjs`,
and it is the only thing that can test the JOIN — that every damage path records
what it was made of, that `awardKill` reads the right player's row before
`clearThreat` wipes it, and that the counter therefore moves for one weapon and
not another. Measured, on a seeded level-40 character standing in the same camp:

    holding Thunderhead (lightning)   24 armabees killed   counter 0 -> 0
    holding Frostbrand  (frost)       24 armabees killed   counter 0 -> 4

Twenty-four kills with the wrong element move it by nothing. Plus the browser:
the Herald's panel showing a ready hand-in, four chained follow-ups with their
lock reasons and all six of her original topics, and the tracker reading
"Armabees chilled 4 / 4". Seventeen offline suites, smoke, the new live suite,
both workspaces, zero console errors.

---

## Phase 59 — Everything on the ground is on the ground
The fourth time this project has had the same argument, one level down each
time: the crossing (M54.1a), the feet (M55.3), the contact shade and the pool of
light (M56.1), and now the marks drawn on the floor. Every one of them was two
answers to *where is the ground*, every one was found by a person walking into
it, and none of them threw.

### M59.1 — the marks on the floor, the skill shapes, and the townspeople
Three things, and they are one complaint: they were all drawn at a height
nothing in the world stands at.

### One: five skill shapes were drawn at sea level
A nova, a lingering pool, a cleave wedge, a heal pillar and a volley — every one
of them called with a **literal `0`** for its Y, and they had been since skill
shapes were added. That was exactly right for as long as the ground was a plane,
and it has been wrong since M53.3 gave it relief.

`onGround`'s own note says it was *"spread into every call that used to pass a
literal 0 for Y"*. These five were missed, and nothing catches a number that is
correct everywhere the ground happens to be at sea level.

Measured across the five bands the game is actually played in, where the surface
runs from **-5.5 to +5.7 units**:

    a shape drawn at y = 0 is more than 0.5 units off the ground   39.8% of the play area
    more than 1.0 units off — over half a character's height       28.9%

So a nova rang out underneath a hill and a poison pool hung in the air over a
hollow, across better than a third of the map.

### Two: the ground rings were on the wrong datum AND flat
Both halves, and they are the two halves this log has already recorded twice.

**The datum.** `terrainHeight` is the smooth analytic field; what you can SEE is
that field sampled on a 1.63-unit grid and joined with flat triangles, which
rides above it across **26.8% of the play area, by up to 0.184 units**. Every
ring was placed on the field and lifted 0.028–0.032 — an order of magnitude less
than the error it had to clear.

**And a flat disc on ground that is not flat is a chord.** Measured as the worst
point on the circle, at the ninety-fifth percentile:

                          flat quad   tilted to slope   laid on the ground
    target ring  r=0.6      0.184          0.013              0
    slam         r=2.5      0.783          0.151              0
    reach        r=5.0      1.568          0.551              0

**Which is why these follow the ground per VERTEX rather than being tilted to
it, and that is the decision worth recording.** A single tilt is exactly right
for the contact shade — 1.3 units across, and a plane fits it to 3mm. It is not
right here, and the table says why: at a reach ring's ten units across, a plane
is still a third of a character out at p95. The thing this project already knows
about a chord gets worse with the square of the span, and these marks are the
widest flat things in the game.

**The telegraph is the one that matters.** The whole design of the troll — an
attack you answer by walking out of it rather than by out-healing it — depends on
seeing where it lands. Photographed on the steepest ground in the bands, where
the surface under a 5-unit ring runs from 0.0 to 4.76 against a centre of 0.19:
flat, the slam telegraph is a **sliver** and the reach ring a thin crescent, both
mostly swallowed by the rise. Laid on the ground they are complete circles.

### Three: townspeople stood on the field while players stood on the mesh
M55.3 put the player's feet on `surfaceHeight` and `npcs.ts` was left reading
`terrainHeight`. It is the *worst* case of the three, because a shopkeeper stands
in one place for the life of the world — so where a player's sunk foot is a
passing thing on some ground, a townsperson's is permanent.

### What it costs
One height sample per vertex per move, sixty-four segments a ring. Measured at
the absolute worst case — all five rings rebuilding every frame — **0.54ms of a
16.7ms frame**, and the common case is far below it because `set` returns
immediately when nothing has moved. That guard is the same one the soundscape's
ramps needed and for the same reason: this runs from the render loop, and
standing still is the common case.

Sixty-four segments is chosen so that a segment is shorter than a terrain quad
at every radius these reach — what is left between samples is smaller than the
thing being sampled.

### An eighteenth suite, for a rule this project keeps re-learning
`tools/test/ground.mjs` is a SOURCE test, like `forests.mjs` reading the real
model tables and `ambience.mjs` enforcing the rule its own first paragraph
states. Nothing in Node can import `indicators.ts` or `Game.ts` — they pull in
three.js — and the failure being guarded against is a call site reading the wrong
name, which is plain in the text and invisible everywhere else.

- **Who must read `surfaceHeight`**, by file, each with the reason spelled out.
- **And who may read `terrainHeight`, with a reason each.** The allow-list is the
  interesting half: the smooth field is the RIGHT answer for a dragonfly over the
  Coldwater (it belongs over the water, not over the bridge deck) and for a
  rooted plant (being slightly sunk is what rooted looks like). Requiring a
  reason means the next person to reach for it has to argue here rather than in
  a diff nobody reads.
- **No skill shape drawn at a literal `y = 0`.**
- **And the rule is load-bearing**, which is the half that keeps the rest honest:
  every assertion above is vacuous if the two height functions happen to agree,
  so the gap is measured and the suite FAILS if it ever closes. Somebody then
  gets to delete the rule on purpose rather than by accident.
- **Plus the flat/tilted/per-vertex table**, asserted, so "simplifying" the rings
  back to a tilted quad fails loudly instead of quietly re-burying the telegraph.

Three realistic mutations were run against it — the pillar back to `y = 0`,
`npcs.ts` back to `terrainHeight`, the rings back onto the smooth field — and all
three fail. Eighteen suites, smoke, the live slay suite, both workspaces, zero
console errors.

### The ruler was wrong first, again, and in a new way
The first bank probe reported every sample on the riverbank as near-black and
**the frame was at 23:15**. `dayNight.freeze()` only sets a field; the value is
applied by `update`, which runs from the game loop — so stopping the loop before
freezing pins whatever hour was already on screen. Freeze, let the loop run, then
stop. That is now written down beside the other harness notes, because the
symptom is a perfectly clean measurement of a world at midnight.

### And one thing measured and deliberately not changed
The pale shingle band along the riverbanks was on the list as *possibly reads
wide*. Photographed at noon and sampled along a transect across the Coldwater, it
does not: the ground is back to open-field colour within about 3.2 units of the
waterline, against a river 7.5 units across. `RIVER_BANK_UNITS` is also doing two
jobs at once — it sets the width of the shingle AND how far the bank climbs to
its crest — so narrowing it for the texture would flatten the relief M53.4
deliberately measured up. Left alone, with the measurement recorded, rather than
tuned on a hunch.

---

## Phase 60 — A back yard says what the building is
Reported from play: *"the chapel's back yard is still the emptiest of the six"*.

**The first measurement said the opposite**, and the whole milestone is in why
it was wrong. Counting the props behind each building put the chapel top with
six; the honest count — props inside a building's OWN angular width — still put
it joint top with three. Two rulers, both wrong, and both wrong because they
were counting.

### M60.1 — half the back yards cannot be seen at all
The thing that explains the report is a fact about the camera, and this file
already records it one system over: **this game has ONE camera bearing.** It
looks along -z and only its distance moves, so "behind" is permanent — which is
why the monument has a sight-line rule and why townspeople no longer draw a
through-walls silhouette.

A back yard is further from the centre than the building it belongs to. For the
three buildings on the up-screen half of the ring, that puts the yard behind its
own house from every position a player can stand in:

    seen from the square                  watchpost, chapel, cottage-west
    behind their own building, forever    inn, shop, cottage-east

So of the three yards anybody ever looks at, the chapel's held a washing line
and a water butt against a pell-and-spear-rack and a hayrick. **It was the
emptiest of the three that exist, and the report was exactly right.** Proved by
hiding the shop and re-shooting: its crates, sacks and barrel were all there and
all behind it.

This is reported by the test rather than failed. Those yards are real, a player
standing in one sees it — the blocking building fades — and the collision has to
be right either way. What it changes is where the effort goes.

### And the washing line behind the chapel belonged to somebody else
The comment in `town.ts` says the second line is *"the two cottages' between
them"*. It was typed at bearings 84 and 96. The cottages are at 135 and 330; 90
is the CHAPEL, which has no beds in it. It had hung there for two milestones,
stated in prose and checked by nothing.

**So a back-yard prop names its building now and the bearing is DERIVED.**
`behind(id, building, across, ...)` places a prop as a fraction of its
building's own half-width — 0 dead behind it, ±1 level with its corners, a
little past 1 for a line that runs round the side. Being behind the wrong
building stopped being a number you can get wrong and became a spelling mistake
in a building id. Same call `clearRingAngles` made when two benches turned out
to be standing inside a shop.

### What each yard says now
The rule is the milestone's title, and it is what the counting rulers missed:
the watch had a pell and a spear rack, a cottage had hay, the inn had sheets and
a handcart — four yards that say what they are from across the square. The
chapel had somebody else's laundry and the shop had nothing inside its own width
at all.

- **The chapel — "The Quiet Lamp".** The one building in town that is not
  somebody's trade or somebody's bed, so its back land is a small burial ground:
  three markers leaning at their own angles on their own base stones, and a low
  offering stone with a lamp on it — **the thing the place is named for, which
  had nowhere to stand.** It is a real light after dark, through the same
  `lantern` every other flame in town goes through, at half strength because it
  is a votive lamp and the back lane is meant to be the dark side of the square.
- **The shop — "The Ledger & Lamp".** A counting house, so what waits out the
  back is stock: crates with battens across them and a pile of sacks.
- **The east cottage** got a chopping block with the axe still in it and the
  split logs beside it, because it was the one yard with nothing of its OWN — a
  water butt and half a washing line are both things two other buildings have.
- **And the inn's handcart is the inn's**, rather than a typed bearing sitting
  two degrees outside its wedge.

### Three checks, and each one caught a real thing
`tools/test/town.mjs` grew a back-lane section:

- **No empty yard.** Failing on the shop is what found it.
- **Nothing behind a building it does not belong to.** Reverting the washing
  line to 84/96 fails it twice over — once for being fifteen times its
  building's own half-width away, once for standing behind the chapel.
- **Every yard has something of its OWN**, where a kind is the id with its
  `-a`/`-b1` suffix dropped, so four rain barrels are one kind. This is what
  "says what the building is" actually means, and counting could never say it.
- **And everything placed is DRAWN.** The client had a hand-typed list of four
  rain barrels; the shop's yard gained a fifth. A barrel that is not rendered
  looks exactly like a barrel nobody asked for, while still being something you
  walk around. It reads the table now, and the test parses the client for the
  ids and prefixes it actually draws.

### The rulers were wrong three times, which is a record
- **Counting props answered a question nobody asked.** Twice — once by nearest
  bearing, once by angular width — and the answer was "the chapel is the
  fullest" while a person looking at the game said it was the emptiest. What
  they were looking at was the three yards that are visible and what was IN
  them, and neither ruler knew about either.
- **The angular-separation formula was wrong** and reported a prop at bearing 36
  as nine degrees from a building at 225. It had a spurious `180 - d` in it, so
  it returned the supplement. Every conclusion from that pass was noise.
- **And the distinctiveness check passed the mutation it was written for.**
  `kindOf` stripped a trailing bare letter or bare digits but not `-b1`, so half
  of a SHARED washing line came back as a kind of its own and counted as
  something belonging to the east cottage alone. Fixed, and it fails now.

### One more thing measured and then fixed
The first sacks were `linen` — the off-white the washing is hung in — and
photographed as four pale rounded lumps in the grass beside the crates, which is
to say as BOULDERS. That is the rule this project already has one system over:
nothing scattered may wear the silhouette of something the player is meant to
read as significant, and a rock is the ore node. Straw-coloured and taller than
they are wide now, with a tied neck.

And the grave markers' rounded tops came out sideways, like three little anvils
in a row: `Builder.add` composes rotX, rotY and rotZ through one Euler, and
whether "turn the slab then tip it" and "tip it then turn it" mean the same
thing depends on an order it is not worth reasoning about. **The lean and the
stacking are baked into the GEOMETRY now** — body and cap built about the same
local origin and leaned by the same angle about it — so they are glued together
by construction and only the bearing is left for the Builder.

Eighteen suites, smoke, both workspaces, zero console errors.

---

## Phase 61 — The Provisioner takes something in
*"The Provisioner only sells, never buys"* has been on the list a while, and the
obvious reading of it is the wrong one.

### M61.1 — a counter that takes raw material, and not items
**A vendor who buys ITEMS is a second salvage, and a worse one.** Taking a thing
apart at the anvil gives you its materials *and teaches you to make it*, which is
the best loop in the item system and the one nobody finds on their own — there is
a whole quest about saying it out loud. A counter that did the first half without
the second would be a shortcut past the lesson, so Oswyn still does not buy a
sword and is not going to.

What he takes is **raw material**, and the shortage that answers is real. Summed
over all 115 items in the catalogue, against what one sweep of every node in the
world yields:

                supply share    demand share    ratio
    wood           49.8%          35.1%         1.42
    ore            38.3%          56.0%         0.68
    herb           11.9%           8.9%         1.33

**Ore is the bottleneck by about a factor of two against wood.** Every player
ends up with a pile of wood and herb they cannot spend and short of the one thing
everything is made of. That is the trade, and it touches no part of the item
system at all.

### The rate is steep on purpose, and that is the decision
Four to one. At anything near par the exchange would **delete the bottleneck** —
and the bottleneck is the reason to walk out to the far rings where the rock is,
which is the shape of this entire world. Four to one turns *"I am twelve ore
short of finishing this"* into a walk to the shop, and turns *"I will fund my
smithing by chopping wood"* into obviously bad arithmetic. Oswyn says so himself
when asked.

One rate in every direction rather than six weighted by scarcity: six numbers to
keep true against a catalogue that moves, buying nothing, because nobody trades
toward the thing they already have too much of.

### Essence is not on the counter, and his greeting used to say it was
The greeting read *"Wood, ore, herb, essence — I take all four"*, written when
the counter could take nothing at all. It is wrong twice over now that it can:
essence comes **only off kills**, which is the rule holding the top of the reforge
ladder together, and a shopkeeper who sold it for wood would be a way to buy the
best gear in the game by standing at a tree. The greeting names the three you dig
up, there is a topic explaining the refusal, and `tools/test/quests.mjs` fails if
essence ever appears in the offers.

### Six trades, one row
The stock is nine lines and every ordered pair of three materials is six more;
fifteen rows in a dialogue box is the shop window this project deliberately does
not have. So the exchange is **one row that swaps the list**, exactly as taking a
quest already does — the mechanism was there and only had to be pointed at
something else. Measured in the browser: the list is `overflow-y: auto` and
nothing is unreachable, and the sub-menu holds the vendor at fifteen rows instead
of twenty-one.

The message carries the OFFER'S ID and nothing else — not the two materials, not
an amount — so the rate and the batch are things only `shared/shop.ts` decides. A
packet carrying `{ from, to, give, get }` is a packet a client writes its own
exchange rate into.

### Checked offline for the rules, and over a socket for the plumbing
`tools/test/quests.mjs` walks the table: every ordered pair present (so a fourth
gatherable cannot arrive with half its trades missing), no trade of a thing for
itself, nothing that is not gathered, the rate a genuine loss of at least 3:1,
and — the one that matters most — **the exchange must not undercut the anvil**,
since a markup you can trade your way around is not a markup.

`tools/test/counter.mjs` is a nineteenth suite and it needs a live server,
because every failure of the server half is silent: a spend without a credit just
looks like misreading a number. It checks the refusals — out of range, too poor,
an invented offer id, essence — and then the trade itself. Mutating the server to
drop the `spendMaterials` guard makes it hand out free ore to a character with
five wood, and the suite catches it.

### The probe assumed a precondition instead of asserting it
The range check passed on a fresh character and failed on a seeded one, against a
working game: **a character's position is persisted**, so the second run started
standing exactly where the first left it — at the counter — and "nothing may
happen at range" had quietly become "nothing may happen". It walks away and
confirms the distance first now. Same lesson as projecting a subject before
measuring it, one system across.

Nineteen suites, smoke, both workspaces, zero console errors.

---

## Phase 62 — an axe has no opinions
Phase 48 M4 gave damage a school and gave every creature something that hurts
it. Phase 50 added Storm because a test kept printing `lightning 0 weapons`.
What nobody had ever asked is the question from the other end: **who can
actually deal one?**

### M62.1 — half the weapon families could not reach the school system at all
Measured before anything was written. The earliest band each family could Hold
an element, and what its own talent tree could cast:

              fire  frost  nature  arcane  lightning     its tree casts
    fist        —      —      —       —        —          nothing
    sword       5      5      —       —        4          nothing
    axe         —      —      —       —        —          nothing
    mace        —      —      —       —        5          nothing
    dagger      —      —      5       —        —          nature
    bow         5      —      —       —        —          nature
    staff       —      5      —       1        —          arcane, fire, lightning
    wand        3      —      —       1        5          frost, arcane, lightning

**An axe could not deal a single element by any route** — no weapon of any band
and no skill anywhere in its tree. Neither could fists. A sword reached one at
band 4 and a mace at band 5, and neither could cast anything at all.

So four of the eight talent trees — half the builds in the game — had no opinion
about the deepest system in the combat design, while the two caster families had
all five elements between them from tier 0. Nothing threw. A player holding an
axe in front of a troll simply had no move, and the game never said why.

### And three elements arrived after the thing they answer
The other half of the same measurement. `Levinbrand` carries the rule in its own
comment — *"a player who can only buy the answer at the same ring as the
question has no answer at all"* — and it had only ever been applied to lightning:

    element     earliest creature that folds to it     earliest weapon
    fire        spiky blob, band 2                     band 3
    frost       armabee, band 2                        band 5
    nature      orc brute, band 3                      band 5
    arcane      ghost, band 4                          band 1   ✓
    lightning   golem, band 5                          band 4   ✓

Frost was four rings late. *"Every school is something you can be holding"* is
the claim this project makes about its own damage system, and for two of the five
it was only true in the last ring of the game — which is the same as not being
true, because the whole premise is that the thing in your hand decides what you
are good against **while you are still choosing**.

### Five weapons, and not one of them needed an artist
This is what the three independent axes are FOR. Mesh says what shape it is,
palette says what it is made of, rarity only tints — so an elemental weapon is an
existing model and an existing palette, which is exactly how Storm was added.

- **Cinderbite**, band 2 axe, crimson — the first elemental axe in the game.
- **Adderfang**, band 2 dagger, verdant — nature had exactly one weapon and it
  was band 5.
- **Hoarstring**, band 2 bow, frost — the armabee never touches the ground and
  folds to cold, so a shot is how you reach it and cold is what takes the wing.
- **Rimeblade**, band 3 sword, frost.
- **Sparkhead**, band 3 mace, storm.

No mods on any of them, deliberately: they are the same numbers as their band's
neighbours and the element is the whole difference. *"Within a band the choice is
what you want to BE, not which number is bigger"* — and an element cuts both
ways, since a fire axe against a demon at +50 fire is far worse than a plain one.

Every family now reaches an element by band 3, every element is holdable by band
3, and every element arrives no later than the first creature that folds to it.
Fists stay physical, and that is by construction rather than oversight: bare
hands are a real archetype and there is no item to make them out of.

### The test states the rule, and it found the last gap itself
`tools/test/schools.mjs` grew a section that asserts all three:

- every weapon family can deal an element by band 3, by material or by its own
  tree;
- no element is endgame-only;
- and no element arrives later than the thing it answers.

The third one failed on the first pass — **frost held at band 3 against an
armabee at band 2** — which is how Hoarstring came to exist. Removing Cinderbite
fails it twice over (`a axe can deal an element by band 3 — holds {}, casts []`,
and fire arriving a ring late); removing Hoarstring reproduces the frost failure
exactly.

### Two rulers wrong, both mine
- **The count printed `7/6`.** `WEAPON_TYPES` already excludes fists, so the
  `if (family === "fist") continue` guard was dead code and the denominator was
  off by one. Dead code looks exactly like working code until somebody reads the
  output.
- **And the preview sheet said all five weapons were missing.** They were not:
  `client/preview/` takes `?sheet=weapons` and the default is the full armour
  sheet. A round was spent restarting Vite on the assumption it was serving stale
  modules, which is the failure this file already has a note about — and this
  time it was the URL.

All five photographed on the real rig afterwards, because a mesh and a palette
that have never been combined before can resolve to an invisible weapon while
every number about it stays correct.

Nineteen suites, smoke, both workspaces, zero console errors.

---

## Phase 63 — A fight you can be good at
User brief: *"fix the combat thing where you attack while facing away or running
away"*, then *"improve the combat animations and system, so it's a smooth and
logical MMORPG fight. I would like more skill-based combat."*

The first half is a bug. The second is the reason the bug mattered: a fight you
can win by holding a direction is not a fight you can be GOOD at.

### M63.1 — you fight what you are facing, and a big swing is an opening

### One: you do not swing at something behind you
This game has no strafe animation and no separate facing input — a character
faces the way it is travelling — so *running away* and *facing away* are one
state, and the auto-attack kept swinging straight through it. What that looks
like is a character sprinting north while damage numbers come off something to
the south.

The rule is stated ONCE, in `shared/`, because two people have to agree about
it: the server decides whether the swing happens and the client decides which
way the body points. Two thresholds would give you a character facing its target
and not attacking, or attacking and not facing.

`RETREAT_DOT` is **-0.35** rather than 0, and the number is the design. At
exactly sideways the smallest wobble in a heading would switch it on and off,
and a swing timer that stutters while you strafe is worse than either behaviour
on its own. At -0.35 you may circle a monster, close on it at an angle and
sidestep a telegraph without ever dropping the fight — all things a player does
on purpose — and you stop swinging once you are running more than about 110
degrees away, which is not a manoeuvre, it is leaving.

**The order does not lapse.** Turning back resumes it instantly; it still lapses
on its own once nothing has been in reach for a while, which is what walking
away already meant.

The server has no facing, because `MOVE` carries a place. The heading is DERIVED
from consecutive positions — smoothed, because one step at fifty updates a
second is a few pixels whose direction is mostly noise, and stamped, because a
heading with nothing behind it is a stale opinion about somebody standing still.

### Two: the body faces what it is fighting
One line in the movement loop set facing from input every frame, so the moment
you moved at all your body turned away from the thing your weapon was landing
on — and `onBattleResult`'s `faceToward` was overwritten before it could be
seen. Circling, closing at an angle and sidestepping a telegraph all keep you
pointed at the target now.

**Running away is the exception, and it is not an exception at all**: the same
`isRetreating` the server refuses to swing on says you have left, so the body
turns and goes. Fleeing should look like fleeing, and a character moonwalking
away from a wolf while staring at it is a worse picture than the one being fixed.

### Three: a telegraphed slam is an OPENING
This is the skill-based half, and nothing new had to be invented for it.

The telegraph has existed since Phase 42 — a wind-up you answer by stepping out
of it — and until now the entire reward for reading one correctly was not being
hit. That is a punishment avoided rather than a play made. A fight whose only
expressed skill is *do not stand in the bad circle* is one you can lose but not
one you can be good at.

A creature that has just committed a heavy swing is **`recovering`** for 2.2
seconds and takes **half again as much damage**. So the same two seconds are now
the best two seconds you will get on that thing, and a boss becomes a rhythm:
bait it, step out, spend everything while it gets its weight back.

**Applied whether the slam landed or not**, and that is the whole design. A
creature that only became vulnerable when it MISSED would pay the player twice
for the same dodge; one that only became vulnerable when it CONNECTED would
reward standing in it. It has swung a heavy thing either way.

Short and strong rather than long and mild: the window has to close while you
are still thinking about it, or it is not a window, it is a debuff.

The telegraph, the status table, the nameplate pips and the damage-taken
multiplier were all already here. None of them were pointed at each other.

### Verified
`tools/test/fighting.mjs`, over a real socket, because both rules fail silently —
a swing that should not have happened looks exactly like a swing:

    engaging a spikyblob at 32px
      standing still: 469 damage dealt
      running away:     0 damage dealt
      saw `recovering` land — x1.5 for 2200ms

Eighteen offline suites, both workspaces, zero console errors.

---

## Phase 64 — Spells you can see, and time to react to them
User brief: *"Skills should be very good high quality animations and effects,
with cast time, good cool looking visible projectiles (right now you can barely
see them)."*

### M64.1 — projectiles that are actually there
Measured before anything was changed. The camera sits back far enough that a
1.8-unit character is about twenty-eight pixels tall, so one world unit is
roughly fifteen pixels:

    an arrow        1.0 units long, 0.07 thick     ~15px long and ONE pixel wide
    a beam          0.05 core inside a 0.16 glow   a one-pixel line in a two-pixel one
    a staff's bolt  a 1.5-unit atlas quad          a soft smudge, travelling fast

And worse than any of those: **`arcanebolt`, `firebolt` and `frostbolt` — the
three signature caster missiles — were `shape: "none"` in `skillfx`.** They threw
nothing whatsoever. A mage pressed Firebolt and the only thing that happened was
a burst appearing on the target.

- **A bolt is real lit geometry now**: a white-hot core inside a tinted glow,
  a tapered cone trailing it, and a **real point light travelling with it**.
  The light is half of what sells it — low-poly geometry at this distance
  catches almost nothing, so a bolt that is only a mesh reads as a coloured
  pebble, and at night this one lights the ground it passes over.
- **The trail is a cone, not a box**, on both the bolt and the arrow: what a
  fast thing leaves behind is wider where it has been.
- **The beam trebled in width** and became cylinders rather than boxes.
- **It brightens through the flight** and is spent by the time it lands, where
  the impact burst takes over.

### And a ranged skill throws what your WEAPON throws
Rather than a `bolt` shape added to eleven rows of `SKILL_FX`, the per-hit
travelling quad reads the same `ATTACK_STYLES` table the ordinary attack does.
A bow's Power Shot looses a real arrow; a staff's Firebolt throws a lit bolt; a
wand's skills zap. One rule, no second table, and it is the rule the game is
named for one system across: **what you are holding decides how the spell
arrives.** It is tinted by the school that actually landed, so a warrior casting
with a Frostbrand throws frost.

**And the number waits for it.** A projectile that lands after its own damage has
already been counted is the exact defect the auto-attack was fixed for in Phase
47; the impact, the flash and the floater are all held back by the flight time,
using the same `impactDelayMs`.

### M64.2 — a cast is something you commit to
Every skill in this game has been INSTANT since skills existed. That is a fine
rhythm for a reactive melee kit and it is why a mage has never looked like one:
a firebolt with no cast is a button.

A cast is the one commitment the player MAKES rather than receives. Standing
still is dangerous — that is the entire point of the telegraph — so *is this the
moment to plant my feet for half a second* is a real question with a real wrong
answer, and it pairs exactly with M63.1's `recovering` window: the opening after
a boss commits is when you can afford the big one.

### Who gets one is DERIVED
Eleven hand-picked cast times are eleven numbers that drift, and a ranged skill
added later would silently arrive instant. Scaled off the cooldown, because the
cooldown is already this game's measure of how big a thing a skill is:

- **Ranged only.** Standing still in melee while a troll winds up is a death
  sentence with no counterplay, and the melee kit is the reactive half — Execute
  and Riposte are answers to something that just happened, and an answer you
  have to stand still for is not one.
- **Damage and heals only.** A survival cooldown you must plant your feet for is
  a survival cooldown that gets you killed, and a dash with a wind-up is not a
  dash.
- **And only the big ones.** Arcane Bolt and Power Shot carry the
  moment-to-moment rhythm; giving them a cast would make the basic loop sluggish
  rather than deliberate.

Ten of the forty-three, from 500ms to 900ms. `wardoff` overrides to instant
against the rule, and the override field exists for exactly that: it is a
CLEANSE, the answer to something that has just landed on you.

### Where the cast starts is load-bearing
Exactly between the last validation and the first commit. A cast that began
before the mana check would let a player channel for half a second and then be
told they could not afford it; one that began after the spend would charge them
for something they can still walk out of.

**Moving breaks it** — 14px of tolerance, because bodies push each other apart
and a cast that died because something brushed past would read as the button
being broken. The position is stamped at the START, so a player who walks a slow
circle back to where they began has still walked away. **Pressing something else
is refused rather than queued**: a queue means the button you pressed and the
thing that happens are two decisions a second apart, which is the opposite of
the deliberateness a cast is for.

The completing cast **re-enters `useSkill` with the cast already served**, so
every check runs again against the state as it is now — a player who ran dry or
died mid-cast does not get the spell for free.

### The bar
Centred and low, above the action bar, because it is the one readout you must
watch while also watching the fight. Driven by a CSS transition handed the
duration rather than a rAF loop, so it cannot drift against the server's clock —
a bar that lies about how much time is left is worse than no bar, because the
player will plan around it. An interrupted cast goes red and **freezes where it
got to**, which is the information the player actually wants: how close they
were.

### Verified
`tools/test/talents.mjs` walks the derivation — melee, mobility and the two
rhythm skills may never grow one — and two mutations fail it. `tools/test/
casting.mjs` drives a real socket:

    standing still: cast started, ended clean, skill resolved
    resolved 602ms after the cast began (cast is 500ms)
    walking away:   cast ended (moved), skill did not resolve
    second press:   refused ("already casting")

### And the first run found a bug in the feature itself
*"standing still: cast started, ended clean, NEVER RESOLVED."* The global
cooldown is charged when the cast STARTS — which is the honest moment, since
that is when the player committed the press — and it is 900ms against a 500ms
cast, so the re-entry was refused with "not ready" at the exact instant the
channel finished. The bar filled, the cast ended clean, and nothing came out. A
completing cast does not pay the global cooldown twice.

Eighteen offline suites, both workspaces, zero console errors.

---

## Phase 65 — A camp is a place with animals in it
The monster AI already had more in it than it looked: threat retargeting that
makes tanking possible, leashing, melee slots with a queue, leaps, separation
and telegraphed slams. What it had none of is anything a creature does when it
is not fighting you, and anything a creature does other than walk at you.

### M65.1 — idle is not still, and waiting looks like waiting

### One: every creature in the game was a statue
Thirteen kinds, standing on the exact pixel they spawned on, facing one way, for
the life of the world — until a player crossed the aggro radius, and then
running at them in a straight line.

That is the same complaint Phase 54 answered for the grass and Phase 51 for the
townspeople, one system over: **what reads as alive is not detail, it is motion
with intent.** A wolf pack milling about its clearing is a wolf pack; four
wolves at attention is furniture. And it is invisible as a defect, because
nothing is wrong — there is simply nothing happening.

So an idle monster drifts about its post at a grazing pace, pausing between
legs, with the leg and the dwell jittered per creature out of its own id — the
same reason every idle animation in this game is phase-seeded, so a camp does
not step off together.

**A BOSS DOES NOT WANDER**, and that is the exception worth recording. The three
things with a guaranteed drop are what a player walks a long way to find, and a
creature standing sentinel exactly where the stories put it is doing more work
than one milling about.

Nothing on the client had to change: it already derives a monster's walk from
its position deltas, so the moment the server moved them they walked.

### Two: the back rank stood in a polite semicircle
The melee cap has held the overflow at a wider ring since Phase 42 — and they
stood in it perfectly still, which reads as the pack being broken rather than as
a queue. They circle now, slowly, each in a direction fixed for the life of the
world out of its own id: one picking a way each tick would jitter on the spot,
and a whole ring turning together is a carousel.

Circling says *waiting*, which is exactly what they are doing, and it is the
clearest way a pack tells the player it is a pack rather than a crowd.

### Verified
`tools/test/camps.mjs` stands at spawn and touches nothing for twenty-two
seconds, because walking out to watch would put creatures in aggro and measure a
chase instead:

    80 creatures in view, 71 of them moved
    71/71 ordinary creatures drifted (100%)
    furthest anything got from where it started: 168px, leash is 90
    9 bosses in view, all holding station

It checks all three ways this fails silently — a camp that does not move, a
wander with no leash (which walks a camp out of its own difficulty band over an
afternoon, and the band is the whole way this world is laid out), and a boss
that strolls off. Turning the wander off takes it from 100% to 0% and the suite
says so.

### What is still not there, and is worth its own milestone
**Twelve of the thirteen kinds are melee.** Only the dragon attacks from beyond
contact range, so every fight in the game has the same shape: it runs at you and
you stand there. A ranged attacker is the thing that would make the player's own
positioning matter defensively — but it needs a monster projectile drawn, a
line-of-sight question answered, and a balance pass, so it is a milestone rather
than a paragraph.

---

## Phase 66 — Something that throws it
Flagged at the end of M65.1 and taken next: **twelve of the thirteen kinds were
melee.** Only the dragon reached past arm's length, so every fight in the game
had exactly one shape — it runs at you, and you stand there.

### M66.1 — three creatures that fight at a distance

### The table already said they threw
Four kinds deal a non-physical school, and all four did it from contact range.
The comments beside them are unambiguous:

- *"a demon is made of the fire it throws"* — reach 64px.
- *"the thing you bring lightning to is the thing that throws it back at you"* —
  the golem, reach 78px.
- *"spines with something on them"* — the cactoro, reach 52px.

None of them threw anything. They walked up and punched you, and the damage
happened to be typed. That is the same defect as `shape: "none"` on a missile
one phase earlier: **the prose describes a thing the numbers do not do.**

The ghost is deliberately left alone, and the discrimination is the point — its
own line says *"a cold TOUCH that stays with you"*. A creature is promoted only
where its own text says it throws.

### What a thrower does
Two new fields, and the second is the one that matters.

    kind      reaches  holds at  gives ground at   your speed
    cactoro     185       150         62px/s          220
    demon       210       165         76px/s          220
    golem       200       150         28px/s          220

**`keepAwayPx`** — closer than this and it backs off; further and it closes. It
is the first thing in the game that makes the player's own positioning matter
DEFENSIVELY, rather than only for stepping out of a telegraph.

**`backpedalPace`, and it may never be 1.** A creature that gives ground as fast
as you advance is a creature you can never reach, and that is not a fight, it is
a chore. Closing has to work; what it costs you is the hits you take on the way
in. The golem is the sharpest version of it — the slowest thing in the game,
backing off at 28px/s, which turns it into a turret you walk into rather than a
statue you stand beside.

Only the FRONT RANK gives ground. An overflow monster is already holding a wider
ring and circling it, and backing off from there would walk the whole queue out
of the fight.

### And you can see what it threw
Without a projectile the player takes fire damage from something standing across
the clearing with nothing in between — which is worse than the melee-only world
it replaced, because at least a thing that touches you is visibly touching you.
Monster attacks throw the same lit bolt the player's do, tinted by the school
they deal, and the damage number waits for it to arrive over the real gap.

### Verified, and both rulers were wrong first
`tools/test/bodies.mjs` holds the fairness rules: nothing may backpedal at or
above the player's own speed, nothing may hold a distance it cannot shoot from,
nothing may out-range its own aggro, and **no more than half the bestiary may
throw** — a world where everything kites is a world with one fight in it, which
is this complaint inverted. Two mutations fail it.

`tools/test/throwers.mjs` drives a real socket, and it took two corrections:

- **The first version walked at the creature the whole time** and then failed
  because the gap reached contact. Of course it did: the player advances at
  220px/s and a cactoro gives ground at 62, so running one down is exactly what
  is supposed to happen. What a thrower promises is where it stands when you are
  NOT chasing it, which is a different measurement — so it stands still now and
  lets the creature choose.
- **The second version measured a settled gap of 448px** and blamed the AI for
  fleeing. What it had actually measured was the cactoro dying to an attack
  order left standing by the previous run, and its replacement snapping back to
  a spawn point four hundred pixels away. The probe walks away and lets the
  order lapse first, and abandons the run rather than averaging a teleport into
  the answer.

With both fixed:

    standing still, it settled at a mean of 148px   (its reach x 0.8, exactly)
    chasing it: 43px -> 34px at your 220px/s

Eighteen offline suites, both workspaces, zero console errors.

---

## Phase 67 — The body reacts
The last piece of the combat brief. M55.1 pooled **twenty-five clips** off five
rigs — *"every attack, cast, draw, punch, roll, pickup, death, hit reaction,
idle, walk and run a person in this world can perform"* — and the game bound
**six**.

### M67.1 — three animations that were harvested and never played

### One: a dash was a slide
`Roll` has been in the library since M55.1 and nothing had ever asked for it, so
Charge and Disengage moved the character several metres sideways in its running
pose. It rolls now.

**And a roll is the one one-shot that movement may not cancel.** Every other is
interrupted by running on purpose — a planted swing pose while the character
travels is the sliding that rule exists to stop — but a dash IS travel, so
cancelling the roll on the movement it causes would play the clip for a single
frame and leave the dash looking exactly as it did before.

### Two: picking something up was walking over it
`PickUp` likewise. Taking a thing off the ground was a line in the log and a
floater; the character now bends down for it.

### Three: monsters never flinched
The player has played a hit reaction since the port. A monster flashed white and
went on swinging — which is why even a critical hit read as a number rather than
as an event, and the rigs had been carrying `RecieveHit` the whole time.

**Two gates, and both are load-bearing.** A dagger lands three blows a second,
so flinching on every hit would leave anything fast-attacked permanently
mid-stagger and never attacking back: the animation would eat the fight. So it
takes a hit worth **7% of the creature's own health** — the same measure the
floating damage numbers already size themselves by, so "a hit worth reacting to"
means one thing in the file — and it cannot fire again for 900ms.

A **crit always shows**, whatever it was worth. That is the moment the player
most wants acknowledged, and it is rare enough to be safe.

### A nineteenth suite, for a failure that looks like a decision
`tools/test/animation.mjs`. A state nobody plays is not a bug, it is an
ABSENCE — and an absence is indistinguishable from somebody having chosen not to
have the feature. Ten phases of a rig that could roll and a game that never asked
is the proof.

It parses the `ActorAnim` union and checks each state three ways: that it binds
for monsters and townspeople (`CLIP_PREFERENCES`), that it binds for a player
(`playerClipsFor`, which is separate because a player is the only actor whose
animation set changes without its model doing so), and — the rule this exists
for — that **something, somewhere, actually plays it.** Plus the roll's
protection from its own movement, by name, because a regression there is a
silent return to sliding.

A source test, because the binding happens behind three.js and an FBX loader
that Node cannot load, and because what actually went wrong is visible in the
text: a name in a type union with no call site. Both mutations fail it.

Verified in the browser too — all eight states bind, `roll` resolving to `Roll`
and `pickup` to `PickUp`.

Nineteen suites, both workspaces, zero console errors.

### M67.4 — the sweep, and the opening nobody could see
Three milestones in a row had been the same shape — **a capability that already
existed, wired to nothing.** `Roll` and `PickUp` harvested and never played,
`Spell1` reachable only as a wand's ordinary attack, `shielded` unreachable for
the life of the skill, three caster missiles with `shape: "none"`. Every one was
found by accident. So the obvious move was to stop finding them by accident.

### The sweep, and it came back clean
`__wieldboundClips` is a new debug handle beside `__wieldbound`,
`__wieldboundRules`, `__wieldboundLoad` and `__wieldboundAudio` — because what
the clip library HOLDS is the one half of the question no static read can
answer: the clips come out of five binary FBXs at runtime.

    animation clips   24 of 25 reached
    sound cues        12 of 12 reached
    effect atlas      12 of 14 reached

The three that are not reached are all correct. `Attacking_Idle` is the Rogue's
near-duplicate of `Idle_Attacking`, and `clips.ts` explicitly warns against loose
matching finding both. `shadow` and `holy` are atlas rows for schools this game
deliberately does not have — *"inventing a shadow school to give a palette a job
would be adding an element to fit a palette rather than the other way round"*.

**A negative result worth having**, and it took three wrong rulers to get: a
regex anchored on `playSfx("name"` cannot see `playSfx(crit ? "crit" : "hit")`,
one anchored on `FX_ROW[^;]*;` cannot see a literal that ends `} as const;`, and
a static grep for `"fire"` cannot see an effect chosen through a variable. All
three reported working features as dead.

### And then the thing the sweep could not see
The `recovering` window from M63.1 — the one genuinely skill-based thing in the
fight, two seconds at half again damage taken after a boss commits a swing — had
its only feedback in a small pip on the nameplate.

**A mechanic with no feedback is a mechanic nobody learns.** A player who has
never been told will read the window as the boss randomly taking more damage
sometimes, which teaches them nothing and is indistinguishable from a lucky roll.

So the body glows, and it PULSES rather than sitting at one colour: the whole
information content is *this is running out*, and a steady tint says a state
while a pulse says a clock. Amber, because that is already this game's colour
for "the condition paid" on an empowered hit — the same idea one system over, so
a player who has learned one has learned the other. Read off the broadcast
statuses rather than timed on the client, so what glows and what actually takes
half again as much are one answer.

And the log says it once, on the edge: *"The Troll overcommits — hit it now."*
A window you have to infer from a larger number is a window nobody plays around.

### M67.3 — a skill is posed by what it IS, not by what you are holding
One `play("attack")` served all forty-three skills. So a sword user pressing
Mend did a sword swing, War Cry was a sword swing, and Shield Wall was a sword
swing — while `Spell1` and `Spell2` sat in the pooled library, reachable only as
a **wand's ordinary attack**.

The rule is obvious once it is said out loud: **what you are holding decides how
you SWING, and what you are doing decides whether you swing at all.** A
greatsword is how a cleave looks; it is not how mending somebody looks.

Derived rather than tabled, for the reason cast times are — forty-three
hand-picked poses are forty-three things to keep true, and a skill added later
would silently arrive swinging.

- **Mobility is neither**: a dash rolls, and has since M67.1.
- **Arm's length is a swing**, whatever it is called. Execute, Riposte, Gut
  Punch and Cleave are things you do with the object in your hand.
- **A BOW IS ITS OWN DELIVERY**, and this is why the pose reads the WEAPON as
  well as the skill. A ranger's Power Shot, Multishot and Killshot are archery,
  and the draw-and-loose is exactly right for them; casting a spell to fire an
  arrow is the same mistake in reverse. Staves and wands are the opposite —
  `Spell1` IS their attack, so a ranged spell and a ranged basic attack look
  alike because they are.
- **Everything else casts**: every heal, every buff, anything else thrown from
  range. Those are the ones where what you are holding is incidental.

Holding a sword that is 25 cast, 16 swung and 2 rolled; **fourteen skills a bow
looses that a staff casts**, which is the weapon being read rather than ignored.
And a channelled cast now HOLDS the pose for the length of its bar, which is the
visual point of a cast time — a character standing in their idle for three
quarters of a second and then throwing something has not cast anything, they
have paused.

Every body in the game can reach `Spell1`, which is exactly what pooling the
five rigs bought in M55.1: a warrior holding a greatsword still has the Wizard's
cast to call on when the thing being done is a spell. Verified in the browser —
`cast` resolves to `Spell1` on a sword-wielding character.

The suite checks the rule rather than a table: nothing at arm's length may be
cast, no heal or buff may be swung with ANY of the eight families, archery may
never be a spell, and at least one skill must pose differently for a bow than
for a staff — or the weapon is not being read and the rule is decoration. Two
mutations fail it.

### M67.2 — and the player was being stun-locked by the courtesy
Writing the monster's gate turned up the mirror of it. The player's hit reaction
was `play("hit")` on **any HP decrease at all**, ungated — and the hit clip is a
one-shot that INTERRUPTS, so every one of them cancelled whatever the character
was doing. Measured:

    a wolf pack of three          2.1 blows/sec
    plus a burn ticking           1.0/sec
    a burning player in that pack 3.1 flinches/sec

Three times a second, each cancelling the swing. The animation meant to
acknowledge being hit was locking the player out of their own attack.

### One function, two thresholds, and the asymmetry is the finding
The obvious fix was to pass the monster's rule straight across. The arithmetic
says it cannot work:

    share of the player's health   burn tick   wolf max   troll SLAM
      level  1 (50 hp)               12.0%       8.0%       54.4%
      level 40 (640 hp)               0.9%       0.6%        4.3%

A player's health grows far faster than anything's damage, so **one share
threshold is simultaneously too loose at level 1** — where a burn TICK clears it
and locks you — **and too tight at level 40**, where a troll's slam does not and
you would never react to anything again.

So the two are gated on what is actually wrong with each. **A monster's problem
is MAGNITUDE**: a dagger lands three blows a second and a troll has a lot of
health, so chip damage must not rock it — a share. **A player's problem is
FREQUENCY**: a hit is a hit whatever it was worth, and what it may not do is
happen twice in a beat — so no share, and the cooldown does the work.

And **a damage-over-time tick never staggers anybody**, which is categorical
rather than a threshold — you do not stagger from a burn. It is enforced by
where the call sits: real blows arrive as `MONSTER_ATTACK`, which the death
burst, the slam and the ordinary swing all send and a tick does not.

### The ruler was wrong three times in one suite
- **It read the comments.** Two checks failed against a working game by matching
  the prose that explains the code — the sentence inside `maybeFlinch` describing
  what it does, and a comment in `onHpUpdate` saying the reaction is no longer
  driven from there. A ruler that reads comments is measuring the documentation.
- **It could not find the end of a function.** `/name[\s\S]*?\n  }/` is
  non-greedy, so it stops at the first line that happens to be a closing brace at
  that indent — well before the end of `onHpUpdate`. A mutation putting the
  flinch back was applied, confirmed present in the file, and the suite passed
  anyway. It counts braces now.
- **And the mutation itself was landing in the wrong method**, because
  `String.replace` takes the first occurrence and the anchor was not unique.
  Twice in a row the conclusion "the test does not catch this" was false.

Nineteen suites, both workspaces, zero console errors.

---

## Phase 68 — Can you actually beat the ring you are standing in?
This game's one rule is that **distance from spawn IS difficulty**: five bands
radiating out, a level-1 character clears band 1, the reforge ladder priced
against band 5. Every number behind that has been tuned by argument, none of it
has ever been played through, and so the rule has never once been checked.

It is checkable. `resolveHit` is a pure function in `shared/`, the stat curves
are pure, and the item catalogue is a table. **A fight is a loop.**

### M68.1 — a twentieth suite that simulates the game
`tools/test/balance.mjs` builds a plausible character for each band — the level
the QUEST TABLE gates that band's monsters behind, band gear at Honed (the rung
the catalogue is authored at), stat points where the game's own advice puts
them — and fights every creature four hundred times.

It exists because M66.1 shipped three ranged monsters with a comment admitting
the balance was unverified: a thrower gets free hits while you close, and nothing
anywhere said how many.

### It is a MODEL, and saying so is the point
No skills, no potions, no statuses, no crowding, no double-attack roll —
deliberately, because those are all things the player BRINGS. What is measured
is the floor: an auto-attacking character with band gear and nothing clever. If
the floor holds, the ceiling is the player's business.

    kind        band  lvl  worst win%   slowest kill   worst hp left
    Slime         1    1        100%           6.0s             99%
    Goblin        2    4        100%          11.1s             96%
    Orc Brute     3    8        100%          19.8s             90%
    Troll         4   15        100%          19.6s             98%
    Dragon        5   20        100%          25.3s             87%

Every ring is clearable at the level the game sends you to it, with any of the
seven weapon families, on auto-attack alone.

### And it says what it does not know
The model simulates the approach and then a stationary exchange. **A thrower does
not stand still**: you close, it gives ground, you close again, so its real cost
is spread across the whole fight and this measures only the opening walk. Those
numbers are a LOWER BOUND, and the file says so — the difference between a model
and a claim.

The opening walk turns out to be **nearly free**, which is worth recording rather
than passing over: the aggro radius is 260 and a thrower reaches 185 to 210, so
it notices you about half a second before you are on it and usually does not get
a shot away. Whatever a ranged creature is worth here, it is not worth an opening
volley — it is the giving-ground that makes the fight.

### Four rulers wrong before one number was believable
And every one produced output that looked like a finding about the game.

- **A guessed signature.** `swingIntervalOf(item, rarity, battlePower, agility)`
  called with two arguments returns NaN, which propagated into the fight clock
  and made every comparison false. Reported: every creature in the game wins
  100% of the time with the player still on full health.
- **A second guessed signature.** `critDamageMultiplier(weaponRarity, ...)`
  called with AGILITY indexes the rarity table with a number and returns NaN —
  but only ever reached ON A CRIT, so fights ran normally until the first one
  and then stopped dead. Reported: a level-15 character loses to a troll 99% of
  the time, untouched.
- **A reimplemented character.** Debugging the above in a scratch script rather
  than in the suite put the stat points in the wrong attribute for a dagger user,
  and conclusions were drawn about a character the suite had never built. The
  report now PRINTS who it simulated, because a balance table nobody can check
  is a table nobody should believe.
- **And one expression for two situations.** The approach used the DIFFERENCE of
  the two speeds for every creature. An armabee runs at 215 against a player's
  220, so the model had it walking away from somebody it was charging at, and
  invented a 43-second stroll before a blow was struck. The suite duly failed
  the armabee for being a 51-second fight. **The creature was fine.** A melee
  monster closes at the SUM; only a thrower closes at the difference.

The suite now guards its own arithmetic: a non-finite clock or a non-finite
health throws rather than being reported. An impossible result — a defeat at
full health — is a simulation reporting on itself.

Twenty suites, both workspaces, zero console errors.

### M68.3 — is every weapon still a weapon, and the model was wrong again
"You are whatever you're holding" is the premise this game is named for, and it
only means something if what you pick up is a CHOICE rather than a mistake.
Eight families, one body, and nothing had ever checked the eight were within
sight of each other.

The first measurement was alarming: **a 6.9x spread at band 5** — a dagger
clearing its own band in 3.3 seconds against a scythe's 23.1. Broken down, a
ranger was doing ~99 damage a second against a warrior's ~15, because agility is
the ranger's damage stat AND buys attack speed, accuracy and crit — four things —
while strength buys damage alone.

### Except the model was putting points where the game does not
It spent everything on the class's damage stat plus vitality, which gives a
swordsman **zero agility** — against the game's own printed advice for a sword:
*"Strength is your damage. Agility adds accuracy, crits and the odd double
swing."* `statAdviceFor` is the priority order the character sheet shows a
player, and the model was measuring a build nobody is told to make.

Spending down the advice order instead:

    band 3   2.4x  ->  1.6x
    band 5   6.9x  ->  3.4x

**I nearly rebalanced the entire stat system off it.** The remaining spread is
reported and bounded at 4x — generously, because a slow two-hander is supposed
to be slower per swing, and none of the talent trees are modelled here, which is
where the heavy families do much of their work. What the bound guards against is
a family that has stopped being playable, not one that is merely slower.

### And it invalidated M68.2's numbers, which were re-solved
The slam multipliers in M68.2 were swept against that same wrong character —
too little vitality, too little armour — so they were tuned against somebody
squishier than a real player. Under the corrected model they landed at 16%, 18%
and 26% rather than the ~30% they were chosen for. Re-swept and re-picked:

    troll   x3.4 16%   x4.2 21%   x5.0 27%   x5.8 32%   x6.6 38%
    golem   x3.4 19%   x4.2 25%   x5.0 31%   x5.8 37%   x6.6 43%
    dragon  x2.2 26%   x2.8 ~35%  x3.4 44%   x4.2 57%

Troll x5.8, golem x5.0, dragon x2.8 — standing in every slam now costs 33%, 30%
and 35%. The dragon's multiplier stays much the lowest for the reason M68.2
found: armour subtracts after the multiplier, and a creature that already hits
15-25 needs far less compensation than one hitting 8-16.

**Both curves stay in the file.** A number chosen off a measured curve can be
re-chosen by the next person for a stated reason; a number that sounds right
cannot.

### M68.2 — the telegraph was decoration, and the suite proved it
The first report had the dragon leaving a player on 87% health and the troll on
98%, which read as bosses being harmless. It was the model: **a telegraphing
creature has no ordinary attack.** The server's tick reads

    if (windupMs !== undefined && slamRadius !== undefined) { ... continue; }

so a troll, a golem and a dragon never make a normal swing at all — every blow
they land is a wind-up followed by a slam, and the model had them doing exactly
the opposite. Slams modelled and their real cadence used
(`attackIntervalMs + windupMs`), the picture changed and then said something
worth knowing.

### What a dodge is worth, as a number
Because the slam is their ONLY attack, a player who reads every one takes
**nothing at all** from the three biggest things in the world. Against them the
entire fight is whether you move. So the value of the mechanic is exactly the
cost of ignoring it — and that cost was:

    troll    8% of a health bar
    golem   11%
    dragon  35%

Standing in every slam a troll throws cost eight points of health. **The oldest
skill expression in this game — a wind-up you answer by walking out of it, since
Phase 42 — was decoration on two of its three users.**

### The cause, and why the fix is not one number
Armour subtracts AFTER the multiplier, so a large multiplier on a small base is
mostly eaten: a troll's 8-16 at x1.7 is 14-27, and a band-4 character wears 14
armour. A creature that already hits hard needs far less compensation — which is
why the dragon's new multiplier is LOWER than the troll's rather than higher,
and that inversion is the finding rather than an inconsistency.

Solved by sweeping the multiplier through the simulator rather than picked:

    troll   x1.7  7%   x2.2 14%   x2.8 21%   x3.4 28%   x4.0 36%
    golem   x1.7 10%   x2.2 16%   x2.8 24%   x3.4 31%   x4.0 39%
    dragon  x1.7 30%   x1.9 35%   x2.2 43%   x2.8 59%

Troll and golem to x3.4, dragon to x2.2. Standing in every slam now costs 30%,
30% and 43% — dangerous, survivable, and unmistakably worth avoiding. Dodging
them all still costs nothing, which is the point.

### And two rules the suite keeps
- **A telegraph that costs nothing to ignore is decoration.** If standing in
  every slam a boss throws is survivable without noticing, the wind-up, the
  danger circle and the opening that follows are all theatre.
- **Reading it has to pay.** A dodge that saves single digits of health is a
  skill expression nobody will express.

Twenty suites, both workspaces, zero console errors.

---

## Phase 69 — A conditional you can see
User brief: *"skill expressions are a must in our game"*.

The deepest skill expression this game has already existed and was invisible.
**Eight skills READ a status rather than applying one** — Exploit spends Exposed
for 140% more damage, Follow Through spends Staggered for 120%, Combust spends
Burning, Execute hits 85% harder into any damage-over-time. That is a real
sequencing game: apply the condition, then spend it.

And the only way to play it was to REMEMBER which skill wanted which condition,
notice it on a nameplate mid-fight, and press in time. Press early and a 2.4x
multiplier resolves as a 1x, with nothing to tell you that is what happened.

### M69.3 — a monster that ignores the thing shooting it
Reported: *"when attacking monsters from long range they don't attack you"*. One
symptom, and underneath it two separate mistakes that had been propping each
other up.

**Damage did not aggro its own victim.** `addThreat` ends in a social-aggro
loop: the first time something is hurt it shouts, and every packmate of the same
kind nearby inherits a token point of threat on the attacker. That loop opens
with `if (other.id === monsterId) continue;` — and nothing else in the function
ever touched the monster it was called for. So a creature's FRIENDS charged
while the creature you were actually hitting stood still. Aggro reached it by
exactly one route, walking inside its perception radius, which is why anything
struck from beyond 260px never fought back.

The wake has to sit ABOVE the shout guard, not below it. Everything past
`if (alertedMonsters.has(monsterId)) return;` runs once per monster, and a
solitary creature with no `alertRadiusPx` returns before reaching it — so a lone
target would have kept ignoring you for a second, independent reason.

**And the forget radius was the perception radius.** The chase branch gave up on
anyone further than `AGGRO_RANGE_PX * 1.4` = 364px. But *how far does this thing
notice a stranger* and *how far does it chase someone who is shooting it* are
two different questions, and one number was answering both. Power Shot reaches
340px, and five ranks of the longbow talent (+8% reach each) stretch that to
476 — comfortably outside the radius at which the monster drops the fight on the
same tick a hit starts it.

`MONSTER_FORGET_PX = 700`, deliberately beyond any reach in the game, so nothing
can be killed from a position its target is not allowed to walk to. What
actually bounds a chase is `MONSTER_LEASH_PX` measured from home — that is the
check that stops a pack being towed across the map, it was already there, and it
was doing the job the perception radius was wrongly doing.

### The probe measured moving when it meant closing
`tools/test/aggro.mjs` first asked whether the monster had LEFT ITS POST while
the attacker held station at 532px. A monster that gives up still leaves its
post — it follows during the retreat and only turns round once the gap opens —
so the mutation that put the give-up test back on the perception radius sailed
through at a closest approach of 575px, which is a goblin walking home. What is
asserted now is arrival: it has to close to within 80% of the hold distance.

Four mutations, each caught: shrink the forget radius, put the give-up test back
on the aggro radius, delete the victim wake, and move the victim wake below the
shout guard.

And once on the harness rather than the game — mutation-testing an UNCOMMITTED
fix by reverting with `git checkout` reverts the fix along with the mutation.
Copy the file aside first.

### M69.2 — six skills that looked exactly like a swing
Every skill draws the school's impact burst on whatever it lands on. **So does an
ordinary auto-attack.** Which means a skill whose only visual is that burst is
one the player cannot tell they pressed — and six were: Gut Punch, Concuss,
Stagger, Expose, Backstab and Exploit, all `shape: "none"`.

That is a problem in proportion to what they do. Exploit is a 140% multiplier.
Expose and Stagger are the skills that SET UP the multipliers M69.1 just lit the
bar for. The whole sequencing game was being played with four of its six moves
invisible.

### Two shapes, and each says what the skill does
- **`mark` — a ring snapping INWARD onto a body.** The converging direction is
  the whole idea, and it is the exact opposite of `nova`: a nova radiates out of
  a point because something happened there, and a mark closes in on a body
  because something is being done TO it. Camera-facing rather than flat, which
  matters more than it sounds — a ring at the feet says "this patch of ground",
  and every one of these skills is about the body standing on it.
- **`strike` — one heavy blow landing.** Two rings on the same beat, one
  lagging: a single ring reads as a bubble, and the offset is what makes it read
  as an impact travelling outward.

The four debuff-appliers share the inward ring **deliberately**, for the same
reason the eight readers share an amber cast: what a player has to learn is *a
condition just landed on that*, and four unrelated signatures would teach them
nothing.

Both are placed at the struck creature's own middle rather than at a fixed
height — a slime is 0.8 units tall and a dragon 3.4, and a constant offset puts
the ring round one's ankles and inside the other. Same trade the impact burst
already makes.

### And a rule, plus two places it over-reached
**A melee skill must draw something an auto-attack does not.** `shape: "none"`
stays legitimate for anything RANGED — M64.1 gave those a real projectile that
leaves your hands — and for a dash, which is a roll and a change of position.

The rule was written too broadly twice and the suite said so both times:

- It demanded every melee debuff-applier share the ring, which swept in **Frost
  Nova and Rend** — both AREA skills, whose shape is telling you WHERE it landed
  rather than what it did. Narrowed to single-target.
- Then it still caught **Rend**, which is a slash that happens to bleed and whose
  cone is a signature of its own, already unmistakable from a swing. Forcing it
  into the ring would be the rule reaching into a case it was not written for. So
  what is asserted now is that the ring is a shared VOCABULARY — worn by more
  than one skill — rather than a uniform.

And a third time on the ruler rather than the rule: the check for "can the
renderer draw this shape" scraped method signatures with a pattern anchored on
`name(x: number`, which cannot see `cone` because it declares its parameters
across several lines. It reported a shape the renderer draws perfectly well as
undrawable.

Twenty suites, both workspaces, zero console errors.

### M69.1 — the bar lights when the condition is met
The slot glows when its own condition is satisfied right now — on you for a
self-read, on what you are actually fighting for a target-read.

**This project already wrote the argument down**, about the empowered flash: *"a
conditional you cannot see is one you will not play around"*. That flash fires
AFTER you have committed. This is the same sentence moved to the moment the
decision is made.

- **Amber**, because amber is already this game's word for *the condition paid*
  on an empowered hit, and for a creature that has overcommitted. Learn it once,
  read it everywhere.
- **And it pulses.** The window is closing — a stagger runs out, a burn is about
  to be spent by something else — and a steady glow says a state where the truth
  is a clock. Same call as the opening's glow in M67.4.
- **Driven from `update`, not `render`.** It changes as fast as the fight does,
  and a marker that waited for the next re-render would be a lie for as long as
  it waited.
- **It reads the ENGAGED target**, not the locked one: `engagedId` is what you
  are hitting this instant, which is what the skill will land on.
- **And it is dark when you cannot afford it.** A slot that says "press me" and
  then refuses is worse than one that says nothing.

The hotbar asks `findRead` — the same function the server resolves the bonus
with — rather than reimplementing the match, so the light and the damage cannot
disagree about whether a condition counted.

### Two rules, because both halves fail silently
- **Every reader's condition must be REACHABLE.** A skill that reads a status
  nothing in the game can apply is a slot that never lights and a bonus that can
  never be spent — the same dangling limb `salvage` and `shape: "none"` were.
  Checked against everything skills apply, everything monsters inflict, and the
  three the server applies directly.
- **And the bar has to be told, and told correctly.** A self-read checks your
  own statuses and a target-read checks the target's; getting that backwards
  lights every slot at the wrong moment, which is worse than lighting none.

Verified in the browser by driving real statuses through the real bar: nothing
lit with no condition, Execute lit the moment the target was bleeding, and a
self-read did not light off a target's status.

### And the ruler was too loose, caught by mutating it
The check for "something calls `setConditions`" was a bare `/setConditions\(/`,
which happily matches `noop_setConditions(` — so the mutation written to break
it passed. Anchored on the receiver now. Mutation testing earns its keep
precisely here: the check looked right and was worth nothing.

Twenty suites, both workspaces, zero console errors.

---

## Seeding a character for testing

PLAN has referred to "the seeding recipe" since Phase 50 without one existing —
it was a paragraph describing what somebody had once typed into sqlite by hand.
`tools/seed.mjs` is that, written down:

    node tools/seed.mjs Sawyer [--level 40]

It grants best-in-slot Enchanted band-5 gear in all seven slots, one weapon of
every family so all eight talent trees and all six damage schools are one bag
slot away, spare armour in the other styles for the paperdoll, materials, and
every weapon tree at level 20. **Talent ranks are deliberately not spent** —
points are the thing that is hard to reach; which nodes they go into is the
decision being tested.

Best-in-slot rather than a matched set, and that is a real choice: a full
matched kit deliberately loses to a mixed set one quality step higher, so a set
would be testing the weaker of the two.

Three things it gets right that a hand-written UPDATE would not:

- **It refuses to run while the server holds the file**, and the check is an
  EXCLUSIVE LOCK rather than a look at the WAL size. The first version measured
  the WAL and refused against a perfectly free database, because a server killed
  rather than shut down leaves megabytes of log behind it. Asking SQLite for the
  lock asks the question that has a right answer. It checkpoints the WAL before
  writing, too.
- **It unequips what is already worn** in every slot it fills. The first run did
  not, so a character with the starter weapon still on ended up with TWO items
  flagged equipped in the weapon slot — the server reads a slot expecting one
  thing and takes whichever row comes back first, which is a coin flip that
  would have looked like "the seed sometimes does not work".
- **It is idempotent**, clearing only the base ids it hands out, so running it
  twice does not leave forty Frostbrands in the bag and never touches anything
  the player found or forged.

---

## Coldharrow — parked deliberately, and what it is for
The North Road ends at a cairn and a signpost, and after M53.4 it ends at a
cairn and a signpost on the far side of a river, through a pinewood. The obvious
next move was to build the town. **It is not the next move.**

User call, and it changes the shape of the thing entirely: *"Second town is gonna
be huge, massive city for advanced players. Plan it for later."*

That is worth writing down because it retires an assumption this phase was built
under. The road was laid as "a journey to a second beginner-ish town"; it is
actually the approach to an ENDGAME city, which means:

- It is not a second Emberhold, and it must not be built out of Emberhold's
  parts. Six buildings on a ring inside a palisade is a village. A city needs
  districts, a skyline, and a reason to be laid out rather than radiated.
- Its distance is now a feature rather than an accident. 5,000px from spawn is
  past every band, and the Coldwater with one bridge over it is a gate on the
  approach — which is exactly the shape an endgame area wants.
- It is a PHASE, not a milestone, and probably several. Emberhold took Phase 49
  and Phase 51 between them and it is a sixth the size.
- Nothing in the frontier should be built in a way that assumes the site is
  small. The cairn stays as the marker until the city displaces it.

So the frontier keeps getting dressed and the city waits until it can be given a
phase of its own.

---

## Phase 48+ — Revisit and pick from here
Candidates, in no fixed order: guilds, real auth (password), going live
(VPS + hosted DB), directional (4-way) character art so facing reads on the
Y axis too, ambient world audio and music, more crafting recipes (higher
rarities), multiple crafting stations. Not committing to order yet.

**Parked deliberately, both fallen out of M4.1 rather than wished for:**

- ~~**Skills that READ a status rather than only applying one.**~~ Done in
  Phase 50 M50.2 — all three shapes it named, one per weapon tree.
- ~~**A lightning weapon, and the palette to hang it on.**~~ Done in Phase 50
  M50.1. It read `lightning 3 weapons, 2 skills` afterwards.

---

## Decisions log
(append here as we make non-obvious calls, so we don't relitigate them)

- A MEASUREMENT CONTAMINATED BY THE THING IT CONTROLS WILL LOCK ITSELF IN.
  The pacer measured the display refresh from the gaps between animation
  frames — but a frame that overruns a refresh boundary is called again at
  the boundary after it, so once the game is slow every gap is a MULTIPLE of
  the refresh and reads as a slower display. The divisor is then chosen
  against a doubled budget, the frame appears to fit, the divisor never
  rises, every frame keeps overrunning, and no short gap is ever produced to
  correct the estimate. It reported success at half rate. No statistic fixes
  this — a percentile was tried and failed — because the information is not
  in the samples: every one of them is wrong in the same direction for the
  same reason. Whenever a controller measures a quantity its own output
  perturbs, ask what the measurement looks like once the controller is
  wrong, not only once it is right.
- IF THE DATA CANNOT ANSWER IT, PAY FOR AN OBSERVATION. The refresh interval
  is unknowable from contaminated gaps, and knowable exactly by drawing
  nothing for one frame and timing the callback that follows. Giving up one
  frame every three seconds — one in four hundred, invisible — buys a
  measurement that no amount of filtering could have produced. A deliberate
  probe is a legitimate design, not a hack, when the alternative is a
  control loop running on a number it cannot trust.
- "N PER FRAME" IS NOT A THROTTLE WHEN THE WORK IS ASYNCHRONOUS.
  `MAX_SPAWNS_PER_FRAME = 3` bounded how many rig builds were STARTED and
  nothing at all about how many finished at once — `load()` returns
  immediately and the expensive half runs in the continuation. A dozen
  builds kicked off across a few frames landed their clones together,
  between frames, where no frame timer could see them. Throttle by work IN
  FLIGHT, not by work started, whenever the cost is on the far side of an
  await.
- A TEST THAT MATCHES ONE EXACT CODE SHAPE WILL FAIL ON A REFACTOR THAT
  CHANGES NOTHING. `warmup.mjs` asserted the actor build paths by matching
  `void actor.load().then(async () => {...})` verbatim, and bounding the
  builds added a `.finally()` — so it reported "both paths found — 1" for a
  behaviour-preserving change. It failed for the right reason (something it
  guards did move) and the wrong cause. A source test should match the
  smallest thing that carries the meaning — here, the load call and the
  window after it — or it becomes a tax on every edit near it.

- RAYCASTING A SKINNED MESH IS NOT A RAYCAST, IT IS A SKINNING PASS.
  three.js resolves `intersectObject` against a `SkinnedMesh` by computing
  the posed world position of every vertex in the rig before testing a
  single triangle. On a per-frame hover test against several candidates
  that is thousands of bone-weighted transforms a frame, and it looks
  exactly like the cheap bounding-box raycast the same call performs on a
  static mesh. Nothing in the call site says which one you are getting. Any
  ray against an animated character wants a proxy — a sphere, a capsule, a
  box — unless triangle accuracy is genuinely the requirement.
- FIXING ONE LAZY FETCH REVEALS THE NEXT, and the symptom does not change
  in the meantime. Preloading the thirteen monster models removed real
  multi-second stalls and the report came back with multi-second stalls,
  because gear models were a SECOND lazy path with the identical signature
  — "BETWEEN frames", a couple of seconds, nothing in the loop. When a fix
  is correct and the symptom persists unchanged, the question is not
  whether the fix worked but whether the symptom had two sources; asset
  loading in particular tends to have several, because every subsystem
  fetches its own.
- A LOADING SCREEN IS NOT A FREE PLACE TO PUT WORK. Adding every weapon and
  armour model to the initial load would have fixed the stall and was the
  wrong call: most characters never hold most of that gear, so it is a wait
  everyone pays for something almost nobody uses. `requestIdleCallback` is
  the right home for work that has no deadline and only one requirement —
  not to happen during a fight — and serialising it is what keeps any single
  pause below feeling. The general shape: preload what is CERTAIN to be
  needed (every monster kind is), warm in idle what is merely LIKELY.

- THE INSTRUMENT THAT NAMES THE CULPRIT IS WORTH MORE THAN THE ONE THAT
  RANKS THE SUSPECTS. Five rounds of profiling optimised the render loop
  from 24.49ms to 11.47ms, all of it real, and the player said "still
  laggy" after every one — because both remaining stalls were OUTSIDE the
  loop and no ranking of the loop's own sections could ever have contained
  them. What found them was the hitch reporter printing a line at the
  moment a stutter happened, with the worst section during it and how much
  fell outside the timed sections. Two lines of console output identified a
  3798ms asset parse and a 55ms shader compile that six readings of a
  frame-time overlay had walked straight past.
- PRELOAD WHATEVER IS FETCHED LAZILY DURING PLAY, and check what is NOT on
  that list. Sounds were preloaded in Phase 39 and models never were, and
  nothing about the code looked wrong for thirty phases: `loadModel` caches
  correctly, resolves correctly, and is called from the right place. It was
  simply called for the first time at the worst possible moment. The
  question worth asking periodically is not "is this loader correct" but
  "what does this game fetch for the first time while somebody is playing".
- THREE.JS COMPILES SHADERS INSIDE `render()`, SYNCHRONOUSLY, and it will do
  it for anything newly visible. That makes every first appearance of a
  model a frame spike, and it is invisible in every counter except a
  per-frame worst — the average absorbs it completely. `compileAsync` with
  the object as `scene` and the real scene as `targetScene` compiles one
  thing against the lighting it will be drawn under, off the main thread
  where the driver supports it. Add hidden, warm, then show: the order is
  the whole fix, and showing before warming is the original bug with extra
  steps.
- A PRELOAD WRITTEN AS A LIST IS A SECOND PLACE TO REMEMBER. Iterating
  `MONSTER_MODELS` means a fourteenth kind is covered the moment it is
  added to the table. A hand-written list would work perfectly, pass review,
  and then silently fail the first time somebody adds a monster — as a
  multi-second freeze occurring only in the one corner of the map that
  monster lives in, which is close to undiagnosable. `warmup.mjs` asserts
  the loop form specifically, not just that a preload exists.

- A MEASUREMENT THAT COMES BACK "IT DEPENDS" IS A RESULT, AND THE ANSWER IS
  USUALLY NO. Re-tuning the ground-cover chunk size looked promising and the
  numbers came back as a clean trade: 26 to 44 units is 44% fewer draw calls
  and 35% more instances drawn. Neither side can be priced without measuring
  on a GPU, so the change was not made — and the table was written into the
  log so the next person to have the idea starts from the data instead of
  from scratch. The same standard M70.29 set for the shadow map and the
  pixel ratio: a change with a real cost on both sides is a preference, not
  an optimisation, and a preference needs evidence or a setting.
- CHEAP ALLOCATIONS ARE WORTH REMOVING WHEN THE UNEXPLAINED SYMPTOM IS A
  PAUSE. Two `Vector3` clones and a `Set` per frame will never appear in a
  profiler reading and are not worth chasing on their own. They become worth
  removing once the remaining symptom is specifically a stall BETWEEN frames
  — the shape a garbage collection makes — because the collector's input is
  the total of every small allocation in the loop, and no individual one of
  them is ever the culprit. Optimise for the shape of the symptom, not for
  the size of the line.

- A GEOMETRIC BOUND CAN TURN A WHOLE-WORLD QUERY INTO A LOCAL ONE, and it is
  worth looking for one before optimising the query itself. The occluder
  fade raycast against every object in the world looked like it needed a
  spatial index or a cheaper ray. It needed neither: both ends of the ray —
  the camera and the player's head — are within `CAMERA_MAX_DISTANCE` of the
  player by construction, so nothing further away than that can intersect
  it, and the filter that follows is EXACT rather than approximate. The
  general move is to ask what the query's inputs already guarantee about its
  answer, because a bound derived from the geometry needs no tuning and
  cannot be wrong, while a heuristic radius needs both.
- CULLING AND LOD ANSWER DIFFERENT QUESTIONS AND COMPOSE. "Is this worth
  drawing at all" had taken ground cover from 5126 chunks to a few hundred,
  and it was easy to read that as the distance problem being solved. "How
  much of it is worth drawing" then removed a further half of what survived,
  because the two are independent: the first is about draw calls and the
  second about vertices, and by that point draw calls were no longer what
  was expensive. When one distance-based optimisation stops paying, the next
  one is not necessarily a better version of it.
- AN EXISTING PROPERTY CAN MAKE A FEATURE TRIVIAL — CHECK BEFORE BUILDING.
  Thinning an `InstancedMesh` by lowering `count` draws a PREFIX of the
  instance buffer, which is only an even thinning if the instances are in
  arbitrary order. They were: `buildGroundCover` pushes placements in
  scatter order and buckets them by chunk afterwards, deliberately, so that
  "the field is identical no matter how the chunk grid happens to divide
  it". A decision made for a completely unrelated reason is what turned this
  from a re-sort into two lines.
- A RULE EXPRESSED AS A FRACTION NEEDS AN ABSOLUTE FLOOR WHEN ITS DENOMINATOR
  VARIES. The density bands are a proportion of each species' own cull
  radius, which was the right way to make them scale — and those radii range
  from 39 to 78 units, so the same fraction is 18 units for a pebble and 35
  for tall grass. The short species reached their first thinning band close
  enough to the player that the chunk being stood in could be affected. A
  proportion is a good way to keep a rule consistent across things of
  different sizes and a bad way to guarantee anything about the small end of
  the range; those need a floor stated in the units that actually matter.

- ASK WHAT THE DISPLAY REFRESHES AT BEFORE SETTING A FRAME BUDGET. Three
  entries of this log congratulate themselves for crossing 16.67ms, which is
  the 60Hz figure, on a machine with a 144Hz monitor where the budget is
  6.94ms. The player kept saying it was choppy and the numbers kept saying
  it was fine, and the disagreement lasted four rounds because the refresh
  rate is an input to every one of those numbers and was never asked for. A
  frame budget is not a property of the game.
- EVEN FRAMES BEAT FAST FRAMES. A display changes its picture only on a
  refresh boundary, so what a player sees is not the frame time but which
  boundary each frame lands on. At 144Hz a 15.04ms frame alternates between
  two boundaries and three — 13.9, 20.8, 13.9, 20.8 — while the game clock
  advances evenly, and the eye reads that unevenness as stutter far more
  readily than it reads a uniformly lower rate. A LOCKED 48fps looks better
  than a fluctuating 62. This is also why the profiler could truthfully
  report zero stutters while the player described exactly that: nothing was
  slow, things were merely uneven, and nothing was measuring evenness.
- RUN A NEW RULE ACROSS HARDWARE YOU DO NOT HAVE, ON PAPER, BEFORE SHIPPING
  IT. The pacer's first decision rule applied its safety margin in both
  directions, which was invisible on the 144Hz machine it was written for
  and would have demoted every 60Hz player making a comfortable 60fps to 30.
  It cost one small table of refresh-rate and frame-cost pairs to catch, run
  before the code shipped rather than after a bug report. Any rule keyed on
  a property of the user's machine should be evaluated against a spread of
  those properties, because the author's own is a sample of one and is the
  one case guaranteed to look correct.
- A GUARD BAND BELONGS ON THE REVERSIBLE HALF OF A DECISION. Missing a frame
  budget is a fact — the frame does not appear on the boundary. Fitting
  inside one with room to spare is a judgement about whether it will keep
  fitting. Hysteresis exists to stop a rule oscillating, so it goes on the
  step that undoes a previous decision, never on the step that responds to
  something already measurably true.

- A DIAGNOSTIC THAT ONLY RUNS WHILE SOMEBODY IS WATCHING CANNOT DIAGNOSE A
  SURPRISE. Section timing was gated on the overlay being open, which is
  defensible as an optimisation and useless in practice: every stutter
  report came back saying "(sections not timed — press F3)", because nobody
  has the panel open at the moment a stutter surprises them. Twenty
  `performance.now()` calls a frame is nothing against a 15ms budget. The
  general form: when a measurement is cheap and the event is rare, the
  measurement should always be on, because the cost is paid continuously
  and the value arrives all at once.
- MEASURING "THE FRAME" MISSES EVERYTHING BETWEEN THE FRAMES. Frame time
  ran `frameBegin` to `frameEnd`, inside the loop — a perfectly sensible
  definition that structurally could not see websocket decode and dispatch,
  model loading finishing in a promise, or garbage collection, because all
  of those happen between one frame ending and the next beginning. An 80ms
  snapshot handler lengthens NO frame and stops the picture for 80ms. The
  fix is to measure the gap as well as the work, and the tell that it was
  needed had been sitting in every hitch report: the sections never added up
  to the frame.
- INSTRUMENTING SOMETHING CAN BE WORTH A REFACTOR. The websocket listener
  was one long if/else chain inside an arrow function, which cannot be
  wrapped without wrapping every branch. Extracting it into a `dispatch`
  method to time it once is a change with no behavioural purpose whatsoever
  — and it is the only way to learn whether the network handler is what
  stops the picture. Code that cannot be measured stays unmeasured, and
  "there was no seam to put a timer in" is a reason to add a seam.

- OPEN THE CONSOLE BEFORE OPTIMISING, not after. Three rounds of profiling
  went past a GPU error that was firing hundreds of times a frame, because
  the instrument being watched was a frame-time overlay and the evidence was
  in a different window. `GL_INVALID_OPERATION` does not throw, does not
  reach any JavaScript error handler, and does not stop the picture from
  rendering — the game looks and behaves exactly as if nothing is wrong. It
  took asking the player to screenshot F12 for a completely different reason
  (chasing stutters) to surface it at all.
- AN EARLY RETURN IN A LIBRARY CAN SKIP THE ALLOCATION, NOT JUST THE WORK.
  `WebGLShadowMap.render` bails on `autoUpdate === false && needsUpdate ===
  false` — and that bail is BEFORE `shadow.map` is created, not after. So a
  frame-skipping schedule that looks like it is only declining to redraw is
  also declining to ever build the thing being drawn into, and every material
  compiled with a shadow sampler then binds nothing. When rate-limiting a
  library's internal pass, read what its guard clause is standing in front
  of, because "skip the work" and "skip the setup" are the same line.
- THE SAME MISTAKE, ONE ENTRY APART. The decisions log gained "a knob that
  cannot change on a live renderer must not be in the settings object"
  (about `antialias`) in M70.29 — and M70.29 also shipped a `softShadows`
  knob that three.js ignores, because `PCFSoftShadowMap` is deprecated and
  reassigns itself to `PCFShadowMap` on the first frame. Writing the rule
  down did not prevent breaking it in the same commit. What actually caught
  it was reading the library's source for an unrelated reason. A principle
  in a log is not a check; the test that asserts no such knob exists is.

- JUST MISSING THE REFRESH RATE IS WORSE THAN MISSING IT BY A LOT, and it
  changes what "fast enough" means. At 16.96ms on a 60Hz display, frames
  alternate between one refresh and two — a visible, rhythmic judder that
  reads as far worse than a steady 45fps would. So a frame budget is not a
  gradient to improve along, it is a LINE (16.67ms at 60Hz) with a cliff at
  it, and the last two milliseconds before that line are worth more than the
  ten before them. Worth knowing before deciding an optimisation was not
  worth shipping because it "only" saved 2ms.
- AN INSTRUMENT THAT HAS TO BE WATCHED CANNOT MEASURE A RARE EVENT. The
  profiler reported the worst frame in each 500ms window, which is the right
  figure for steady-state cost and completely useless for "it freezes
  sometimes": the reading that came back said 20.7ms while the player was
  describing stutters they could feel, because the freeze simply had not
  happened during the half-second on screen. Two fixes, and both are about
  the SHAPE of the measurement rather than its accuracy — remember the worst
  over ten seconds instead of half of one, and have the stutter report
  ITSELF to the console rather than waiting to be observed. The second is
  what made it free to leave on with the overlay closed.
- "HOW MUCH OF THE FRAME WAS OUTSIDE THE TIMED SECTIONS" IS A DIAGNOSIS, not
  a gap in the data. If the sections add up to the frame, something in the
  loop was slow and the sorted list says which. If they add up to a fraction
  of it, the stall was not in the loop at all — garbage collection, a
  texture upload, a shader compile — and no amount of optimising the listed
  subsystems will touch it. Printing the difference is what lets one console
  line tell those two apart, and they have nothing in common as problems.
- A SHADOW MAP IS A SECOND RENDER OF THE WHOLE SCENE, and framing it that
  way is what makes the fix obvious. It is easy to read `shadowMap.enabled =
  true` as a shading option and hard to remember it means every casting
  object in the frustum is drawn twice per frame. Once it is named as a
  second render, the question "does it need to happen sixty times a second
  when almost every caster is scenery that will never move" answers itself.

- SEPARATE WASTE FROM TASTE BEFORE OPTIMISING, because they call for
  opposite kinds of change. Geometry drawn at a distance where it cannot be
  seen is WASTE: removing it needs nobody's opinion, nothing looks
  different, and it is simply a fix. A 2048x2048 soft shadow map, a device
  pixel ratio of 2 and multisampling are TASTE: each is expensive and each
  buys something real, and which side of that trade a player wants depends
  on their machine and their eyes. Shipping the first as a fix and the
  second as a SETTING is what stops a performance pass from quietly
  degrading the game for everyone who was happy with it — and it is also
  the only honest answer to "make it run on lower-end machines", which is a
  request about a range of machines, not about one.
- DRAW CALLS SCALE WITH SPECIES x CHUNKS, NOT WITH INSTANCE COUNT, which
  inverts what looks worth cutting. The instinct is to go after the biggest
  numbers in the table — 1750 short grass, 1200 wispy — but those are
  instances inside an `InstancedMesh` and cost one draw call however many
  there are. What costs draw calls is how many SPECIES have a chunk in
  range, and thirteen of the twenty ground-cover species are tiny props
  (pebbles, clover, mushrooms, small flowers) with small counts and full
  draw-call price. Retiring those by distance was worth far more than
  anything that could have been done to the grass.
- A KNOB THAT CANNOT CHANGE ON A LIVE RENDERER MUST NOT BE IN THE SETTINGS
  OBJECT. `antialias` is fixed when the WebGL context is created; putting
  it in `QualitySettings` next to pixel ratio and shadow size would have
  produced a field that reads correctly, applies silently, and does
  nothing — the exact shape of a bug that survives for a year because every
  code path involving it looks right. It is left out, with the reason
  written where somebody would go to add it.
- THREE.JS WILL LET YOU CHANGE `shadow.mapSize` AND IGNORE IT. The old
  texture is already allocated and rendering continues into it at the old
  size, so the setting appears to work and does nothing. `shadow.map` has
  to be disposed and nulled to force the rebuild. The neighbouring trap is
  the opposite shape: changing `shadowMap.type` requires every material in
  the scene to be invalidated or the change is invisible — but that is a
  full recompile and a stall of a second or more, so it must be guarded to
  fire only when the shadow model actually changed. One setting object,
  two knobs, and each needs the opposite treatment.

- A PROFILER CAN END AN ARGUMENT IN ONE READING, which is the whole case
  for building the instrument before the fix. "The game lags" had produced
  three plausible suspects (shadow map, pixel ratio, instanced mesh count)
  and no way to choose. One F3 reading answered it and eliminated an entire
  half of the search space permanently: `render` was 14.63ms of a 17.81ms
  frame and ALL the loop's JavaScript together was 2.4ms, so every
  micro-optimisation anyone could have made to those thirty subsystems was
  worth at most a rounding error. The lesson is not "profile first" as a
  slogan — it is that the reading did not just rank the suspects, it proved
  a whole category of work pointless, which no amount of reading the code
  would have done.
- FRUSTUM CULLING IS NOT DISTANCE CULLING, and having one makes the absence
  of the other harder to notice. Ground cover was chunked deliberately and
  correctly so the frustum test could reject what is off screen, the
  comments say so, and it works — which is exactly why nobody asked the
  next question. A camera 22 units from the player looking at a far plane
  of 400 keeps most of a 400x300 world INSIDE the frustum, so the test that
  was working was rejecting almost nothing. When a system exists to solve a
  problem and the problem persists, check whether it is solving the half
  you are not measuring.
- CULL AGAINST THE INSTANCE SPHERE, NOT THE GEOMETRY'S, and the bug if you
  get it wrong is silent and total. `InstancedMesh.computeBoundingSphere()`
  bounds where the placements actually are; `geometry.boundingSphere`
  bounds one prototype plant sitting at the origin. Culling against the
  latter gives every chunk in the world an identical centre, so the entire
  field either draws or vanishes as one — and nothing throws, because both
  are perfectly valid spheres. `tools/test/culling.mjs` asserts the centres
  are DISTINCT for exactly this reason. Both builders already computed the
  instance sphere, and both had a comment explaining why (the frustum test
  rejected a chunk the moment its origin left view) — the same fact, found
  twice, for two different tests.

- A LIBRARY CAN TURN A FLAG OFF THAT ONLY ITS OWN RESET TURNS BACK ON, and
  skipping that reset for a good reason quietly takes on the job of
  restoring the flag yourself. `play` skips `reset()` for run so a resumed
  stride does not snap to frame zero — a real fix for a real report. What
  nobody checked was what else `reset()` does: it is three.js's ONLY setter
  for `AnimationAction.enabled`, and `_updateWeight` clears that flag on
  its own whenever a crossfade-out completes. So the optimisation removed
  the only path back from a state the library enters by itself. The lesson
  is not "do not skip reset" — it is that skipping a library call means
  inheriting every side effect it had, and the way to find them is to read
  the call, not to reason about its name.
- WHEN A SYMPTOM IS "INTERMITTENT", ASK WHAT IS DIFFERENT ABOUT THE TIMES
  IT DOES NOT HAPPEN. The run action dies only when a crossfade-out runs to
  COMPLETION, which needs the player to be standing still while an attack
  interrupts the stride — attack on the move and `play("run")` re-crossfades
  before the fade finishes, and nothing breaks. That is why it read as
  random, and why "especially in combat" was the single most useful word in
  the report: it narrowed the search from the whole renderer to what a
  one-shot does to a stride.
- THREE.JS'S ANIMATION SYSTEM RUNS UNDER PLAIN NODE, so an animation bug can
  be REPRODUCED rather than argued about. `AnimationMixer`, `AnimationAction`
  and `AnimationClip` need no GPU, no canvas and no loader — a bare
  `Object3D`, a `VectorKeyframeTrack` and a hand-driven `mixer.update` loop
  are enough to run the real library through the exact call sequence and read
  the real effective weight back. Three sessions of this bug were spent
  reading source and reasoning about state machines because the assumption
  was that anything touching animation needed a browser. Only the BINDING
  half needs one (which is why `animation.mjs` is correctly a source test);
  the state machine half does not.

- A DELIBERATELY SILENT NO-OP IS A PLACE A BUG CAN LIVE FOREVER, and the
  more correct each individual early return is, the better it hides one.
  `Actor.play` has six of them and every single one is right: "you are
  already in this state" must cost nothing, a swing must not be cut short
  by an idle, a roll must survive the movement it causes. But five are
  bounded by a clip ending and the sixth — a `currentAnim` of "die", whose
  `oneShotUntil` is `MAX_SAFE_INTEGER` — can never stop being true. From
  outside, a permanently locked actor and a healthy one are IDENTICAL:
  `play("run")` is called every frame and returns without a word in both
  cases, nothing throws, and `mixer?.update()` swallows even a missing rig
  through its `?.`. Three sessions of reading the call graph did not find
  it, and the console never produced the clue the user was told to look
  for, because there was nothing to produce. When a symptom is real and
  reproducible but nothing anywhere reports it, look for the code that is
  SUPPOSED to say nothing, and check whether any of its exits are
  unbounded in time.
- WHEN THREE CAUSES HAVE BEEN WRONG, STOP NAMING CAUSES AND DETECT THE
  SYMPTOM. M70.5, M70.14, M70.22 and M70.23 each fixed a genuine bug that
  fit the slide report, and the report survived all of them. A fourth
  theory-only fix had poor odds. The symptom, by contrast, is exactly
  expressible in code the game already has — the body is translating and
  the pose is not — and both halves were already sitting in the loop.
  A watchdog on that is not a bandage over a bug that should have been
  found properly: it is the only thing that can distinguish "fixed" from
  "not reproduced yet" on a bug whose failure mode is silence, and it
  turns the next occurrence into a log line with full state instead of
  another round of guessing.
- A CHECK THAT PASSES AGAINST ITS OWN MUTANT IS WORSE THAN NO CHECK,
  because it is also a claim. `sliding.mjs`'s guard against re-nesting
  `revive()` inside the respawn-coordinate branch was first written with
  string offsets against a fixed-length slice, and it passed cleanly when
  the recovery was deliberately moved back inside the guard it exists to
  forbid. It was only caught because the mutation was actually run. The
  rewrite brace-matches the block properly — and the lesson is that
  mutation-testing a new guard is not optional polish, it is the step that
  tells you whether you wrote a test or a decoration.
- MEASURE BEFORE CUTTING, ESPECIALLY WHEN EVERY CANDIDATE COSTS PICTURE.
  Asked to make the game run on lower-end machines, the obvious suspects
  were all immediately visible: a 2048x2048 PCFSoft shadow map re-rendered
  every frame, `setPixelRatio` capped at 2 (four times the fragments of 1
  on a high-DPI display), 584 instanced meshes. Every one is a real cost
  and every one is a VISUAL trade-off, so picking between them by
  plausibility would be guessing with the player's picture as the stake —
  and the one that looked most likely of all, ground cover casting
  shadows, turned out to be already handled. The instrument (`profiler.ts`,
  F3) came first, and only the single change that costs nothing to look
  at — skipping a shadow projection-matrix rebuild whose four inputs were
  bit-identical to last frame's — shipped without numbers.

- A FIELD "USED IN SHARED" IS NOT THE SAME AS A FIELD THE PLAYER CAN SEE,
  and a naive "is this referenced in client/?" grep will clear it anyway.
  `StatusDef.modifiers` came back as reachable from the client — through
  `statusModifiers`, into the character sheet's "Running effects" total.
  That is real, and it is also only an AGGREGATE, for the local player,
  with every running effect summed together; the question a player asks
  by hovering one pip ("what is this ONE thing doing to me") was still
  unanswerable. The three sibling fields next to it (`moveMultiplier`,
  `damageTakenMultiplier`, `dot`) had no expression at all and were the
  easier find. The lesson is that the sweep's real question is not "is
  this symbol referenced anywhere" but "can a player read this number at
  the moment they would want it" — a field can pass the first test and
  fail the second, and the second is the one the gap is measured in.
- A `blurb` FIELD IS DOCUMENTED TO OMIT THE NUMBER, so prose being present
  is not evidence the fact is covered. `StatusDef.blurb`'s own doc comment
  says it exists to state what an effect DOES "not what it is" — one line,
  for a tooltip — and every one of the fifteen honours that faithfully.
  Which means the surface LOOKED complete: hover a status, get a name, a
  category and a sentence. Two of those sentences were making claims only
  the table could settle ("it slows what it is in", "hits harder"), and
  the sentence being well-written is exactly what made the absence hard to
  notice. When a field's contract is "the shape, not the size", the size
  is by construction somewhere else, and whether anything shows it is a
  separate question worth asking.

- NOT EVERY "GAME FREEZES" REPORT HAS A JS-LEVEL CAUSE, and the tell is
  when a targeted reproduction attempt finds nothing wrong in application
  logic despite genuinely exercising the reported path (real movement,
  real combat, real interruption/resume cycles, extended real time,
  through an actual kill). M70.22's freeze fit the EXACT shape of the
  earlier M70.5/M70.14 bugs — position updates, animation stalls — but
  three separate targeted repro attempts covering that class of cause
  found nothing. It surfaced by accident, as a raw console line
  (`CONTEXT_LOST_WEBGL`) during an unrelated synthetic test, not from
  reasoning about the JS call graph — because the actual cause was a
  layer below JS entirely (the GPU context), which a codebase can go its
  whole life never once triggering in a JS-only test harness. When
  in-logic hypotheses keep failing to reproduce a symptom that LOOKS like
  every earlier fix's symptom, that is itself a signal to widen the
  search rather than narrow it further.
- `fighting.mjs` FAILING AGAINST CACTORO SPECIFICALLY IS A KNOWN, ACCEPTED
  TEST-BOT LIMITATION, not a regression to chase every time it recurs
  (hit in M70.16, M70.17, M70.18). The bot walks straight at whatever is
  nearest and stands there; cactoro's `keepAwayPx` backs off exactly as
  designed, so a bot with no pursuit logic can spend its whole 9s window
  never in melee range. Re-running once (nearest monster varies run to
  run) is the correct response, not investigating the change under test —
  every recurrence so far has been a client-only or wire-protocol change
  with zero path into combat resolution.
- A HEADLESS-BROWSER REPRODUCTION ATTEMPT THAT COMES BACK EMPTY IS NOT THE
  SAME AS "NOT A BUG" — it can just mean the harness cannot exercise the
  timing the bug depends on. A first attempt to reproduce the run/attack
  sliding measured facing-vs-velocity mismatch over simulated movement and
  got almost no samples, because headless Chromium's rAF throttling (the
  same limitation documented back in M70.5) meant only a handful of real
  frames executed in the whole window. Rather than conclude the bug wasn't
  real, the fix was found by READING the animation code's own state
  machine instead, then verified with a narrower, timing-independent
  check: sampling `AnimationAction.time` directly across a real
  interruption, which needs only a few actual frames to prove continuity
  either held or broke — not dozens of smoothly-spaced samples.
- A TYPE ERROR CAN POINT AT AN EXISTING INTENDED PATTERN INSTEAD OF A NEW
  DECISION TO MAKE. Adding `hp`/`maxHp` to `PlayerState` broke the
  server's live-player record (`LivePlayer = Omit<PlayerState,
  "weaponRarity" | "armorRarity">`) because the login handler's object
  literal never supplied them. The fix was not to make the fields
  optional or invent a new pattern — `LivePlayer`'s own `Omit` line was
  already reaching for exactly this shape, just with two keys
  (`weaponRarity`/`armorRarity`) that did not actually exist on
  `PlayerState` yet, making that part of it a no-op. Adding `hp`/`maxHp`
  to the same `Omit` completed a pattern that was clearly already the
  intent — equipment rarity and HP both live in their own source-of-truth
  maps and get merged in only at broadcast time — rather than adding a
  second, different way of handling the same kind of field.
- SETTING A TARGET VALUE AND READING THE EASED RESULT IN THE SAME TICK IS A
  RACE, even when both lines are right next to each other and look
  synchronous. `onBattleResult` called `faceToward` and then immediately
  read `muzzlePosition` (which depends on the bone's actual current
  rotation) one line later — but `faceToward` only ever sets `targetFacing`;
  the real rotation eases toward it over several frames. Two adjacent lines
  of code do not imply the second sees the first's intended effect if
  something in between is animated rather than assigned. The fix
  (`instant` parameter, applying the rotation THIS frame) is opt-in rather
  than the default specifically because most callers — an idle glance, the
  player's own body turning while circling a target — want the easing;
  only a same-tick read like this one needs to bypass it.
- AN AGGREGATION KEY HAS TO MATCH WHERE THE OVERLAP ACTUALLY COMES FROM. A
  first version of the combat-log merge keyed grouped hits by monster id,
  reasoning that repeated swings from the same attacker should collapse —
  but every kind's own `attackIntervalMs` is 1.4-3 seconds, far longer than
  any sane merge window, so a per-monster key would almost never trigger.
  The actual overlap a pack fight produces is BETWEEN different monsters'
  independent timers landing close together, which only a shared key
  catches. Re-derive what two events actually have in common before
  picking what to key a merge on — "the same thing happened twice" and "two
  different things happened at once" call for opposite keys.
- HEADLESS CHROMIUM'S TIMER THROTTLING BREAKS setTimeout AS A TEST PACING
  TOOL, not just as a game-loop concern. A live test for the combat-log
  merge used `setTimeout(60)` between calls to simulate hits arriving a
  beat apart, and failed — not because the merge was broken (a zero-gap
  version of the same test passed cleanly), but because the backgrounded
  headless tab can delay a nominal 60ms `setTimeout` well past the merge
  window while `performance.now()` — what the feature itself times against
  — keeps accurate wall-clock time regardless, so the two drift apart. Same
  throttling class as the rAF issue in M70.5's freeze-fix verification.
  Fixed by dropping the artificial delay rather than lengthening it: real
  `MONSTER_ATTACK` messages arrive back-to-back through one handler, so a
  synchronous test is the more faithful simulation, not a workaround.
- A CODE COMMENT CAN BE THE BUG, not just miss one. `setChilled`'s own doc
  comment claimed Poison Arrow's slow was ALSO supposed to show blue — it
  wasn't a stale comment describing removed behaviour, it was the original
  design intent, and it was wrong the day it was written: the monster call
  site (`s.slowed`, true for any `moveMultiplier`-under-1 status) faithfully
  implemented exactly what the comment said and produced a poisoned or
  staggered creature glowing Frost Nova's colour. Grepping for what a
  comment claims and diffing it against what the code actually does is a
  real way to find a bug a "does this feature exist" search would miss
  entirely, because the feature DOES exist — it is just wired to the wrong
  status.
- A RESEARCH REPORT'S SUGGESTIONS ARE A STARTING POINT, NOT A SHORTLIST TO
  APPROVE. Asked where the next monster-AI gap was, the research came back
  with three candidates for a low-HP flee mechanic — goblin, wolf and
  (for a parallel enrage idea) demon and troll. Checking each kind's own
  bestiary text against the M70.4 rule ("arguable from its own line, not
  chosen for being next in line") ruled out every one of them except
  goblin: wolf's leap comment explicitly frames its whole identity as
  COMMITTING to a distance, the opposite of giving ground; demon's comment
  calls it the kind with no tell, already always at full aggression; troll
  has no textual seed for panic at all. Only the goblin's existing
  `alertRadiusPx` — "I do not fight alone" — argues for "and I do not fight
  to the death alone either." A subagent's fact-finding is not the same
  pass as the judgment call about which fact to act on.
- A NEW AI STATE'S PASS THRESHOLD HAS TO ACCOUNT FOR REAL PLAYER DPS, not
  an assumed one. The first live-verification run against the flee
  mechanic gave the test character 30 seconds and it never even reached
  the 20%-HP trigger — not a bug, just a slower real attacker than the
  test assumed (9 of 35 HP in 30s). Fixed by extending the test window
  rather than by adding a debug HP-set hook, since a hook that lets a test
  skip real combat would stop being a test of the real trigger path.
- "MODEL ALREADY CACHED" DOES NOT MEAN "CHEAP" — it means the expensive
  part (the network fetch) is gone, not the expensive part that matters
  here (cloning a skeleton, rebuilding a mixer, rebinding clips), which
  still runs in full for every instance. A cached model resolving its
  `load()` promise instantly is exactly what let a whole camp's worth of
  monster builds land in the same microtask flush — the caching that makes
  repeat spawns feel free is the same thing that let them all become due
  at once. Fixed by queuing spawns and building only a few per frame
  (`processMonsterSpawnQueue` in Game.ts), not by trying to make the build
  itself cheaper.
- A LIGHT ADDED OR REMOVED FROM THE SCENE IS NOT A LOCAL COST — it changes
  the light count baked into every OTHER lit material's shader at compile
  time, so churning one light per bolt/beam/flash was stalling every
  character and building in view, not just the projectile. Fixed with a
  fixed-size `LightPool` (client/src/three/lightPool.ts) whose lights stay
  in the scene permanently and are borrowed/returned rather than
  created/destroyed, so the count the renderer sees never changes after
  the first frame.
- A POOL'S "RETURNED" ITEM HAS TO BE VERIFIED STILL ATTACHED TO WHAT OWNS
  IT, not just present in the free list. `LightPool.release()` originally
  only pushed the light back into the free array — but callers parent an
  acquired light under a short-lived effect `Group`, and removing that
  group from the scene on expiry took the light with it even though its
  reference was "returned." The pool silently shrank by one every time a
  bolt or flash finished, converging toward zero lights working at all.
  Fixed by re-parenting onto the scene root inside `release()` itself, so
  the invariant ("every pooled light is always a direct child of the
  scene") is enforced at the one place that could break it, not left as
  something every caller has to remember.
- A LIVE TEST'S PASS THRESHOLD HAS TO BE DERIVED FROM WHAT THE SCENE
  ACTUALLY CONTAINS, not guessed. A first version of the light-pool
  verification counted every `THREE.PointLight` in the scene and compared
  it to the pool size (16) — but the town alone has dozens of torch/forge/
  square-glow lights, so the "baseline" was 45, not 0, and a hardcoded `<=
  16` failed even a correctly-working pool. Fixed by tagging pooled lights
  (`light.userData.pooled = true`) so the test — and any future scene
  inspector — can isolate exactly the lights it's supposed to be checking.
- A DEFENSIVE FIX AND A ROOT-CAUSE FIX ARE DIFFERENT DELIVERABLES, and
  shipping the first is not a substitute for the second when a user calls
  a bug urgent. The freeze report ("game freezes completely" during combat)
  got a real structural fix — `loop()`/`loopBody()` split with
  `try`/`catch`/`finally` so a thrown exception costs one frame instead of
  the whole session — but the specific exception that was actually firing
  in the field was never identified, because the mitigation makes it stop
  mattering which one it was. Documented as a mitigation, not a diagnosis,
  rather than implying the original trigger is understood.
- A TEST'S "AFTER" SIGNAL HAS TO BE INDEPENDENT OF WHAT IT'S PROVING. A
  first attempt at proving the freeze fix sampled player position before
  and after an injected exception — but no movement input was being
  simulated at all, so position was static in the baseline too, and the
  test failed for a reason that had nothing to do with the fix. Switched to
  three.js's own `renderer.info.render.frame` counter, which increments on
  every successful render regardless of whether the character moves, and
  to a threshold measured against that same run's own baseline framerate
  rather than a guessed constant — headless Chromium throttles rAF hard
  enough (~2fps observed) that a fixed threshold either passes vacuously or
  fails a healthy loop.
- A CONSISTENT PATTERN IS NOT THE SAME AS A DOCUMENTED RULE, and both have to
  be checked before touching it. Telegraphs being boss-only (exactly the
  three `guaranteedDrop` kinds) held for three creatures running, which
  looked like a scope decision — but nothing in the Decisions log actually
  said so, which means it was available to extend rather than something to
  work around. Asked before assuming either reading.
- WHICH MONSTER GETS A NEW MECHANIC SHOULD BE ARGUABLE FROM ITS OWN TEXT,
  not chosen for being next in line. Orc brute's "a body behind it" is the
  one line in the band-3/4 bestiary that actually describes mass committed
  to a blow; demon's "the troll's damage WITHOUT THE TELL" rules it out by
  name. A kind that already has its own positioning trick (cactoro's
  keepAway, goblin's shout, ghost's evasion) was left alone on the same
  logic Rend keeps its own cone: a second trick stacked on a kind that
  already has one is not the same move as giving the trick to a kind with
  none.
- A REUSABLE ACCEPTANCE TEST TURNS A NEW BALANCE NUMBER INTO SOMETHING
  SOLVED RATHER THAN GUESSED. `balance.mjs`'s "what a dodge is worth" check
  already reads `windupMs`/`slamRadiusPx` off every kind generically —
  nothing hardcoded troll/golem/dragon — so extending the telegraph to a
  fourth kind meant the SAME acceptance bar applied for free. The first
  guess (5.2, scaled naively off troll) failed it outright: 78% health lost
  standing still and a 35% loss rate at the level band 3 sends players to.
  Measuring caught that before a player would have.

- A FIELD CAN BE RIGHT FOR THE GAMEPLAY THAT READS IT AND WRONG FOR THE
  BROADCAST THAT RENDERS IT. Resetting a dead monster's position to home
  immediately cost nothing gameplay-side — every AI and collision pass
  already skips anything not `"alive"` — but the same field is also what
  the client draws the corpse at, and THAT consumer needed the real death
  spot for a beat it was never given. One field, two audiences, only one of
  which the original write actually served.
- MOVE A RESET TO THE MOMENT ITS OWN REASON STARTS BEING TRUE, not the
  moment that is merely convenient to write it at. The position only needs
  to be "home" once something is standing there again to see it — the
  respawn tick — not from the instant of death, which is simply the last
  point before then that anyone happened to be touching the code.

- THE OLDEST REWARD IN THE LOOP IS NOT AUTOMATICALLY THE BEST-SIGNALLED ONE.
  Essence, runes and recipes all got a "+N" floater and a sound this
  session; wood, ore and herb — the gathering that predates every one of
  them and is what a fresh character does first — had neither. Age in the
  codebase is not evidence of completeness; it can just as easily mean a
  system shipped before the convention existed and nobody went back.
- A REWARD'S SIZE IN THE FICTION AND ITS SIZE IN THE FEEDBACK SHOULD AGREE.
  A rune draw and a learned recipe both got a floater and a sound; a
  completed quest — a story beat AND a reward, the biggest single moment
  the quest system produces — got neither. The smaller rewards being
  better-signalled than the larger one is itself the tell that the gap is
  an oversight, not a deliberate restraint.
- THREE FLAGS, NOT ONE SHARED ONE, WHEN THREE MESSAGES DO NOT ARRIVE
  TOGETHER. Wood/ore/herb's own messages land at different points after
  connect rather than in the same breath the wallet/runes/recipes trio
  does, so a single "seen" flag would already read true by the time a
  later one lands and congratulate a returning gatherer on a balance they
  walked in with — the same reasoning `recipesSeen` was already kept
  separate from `walletSeen` for.

- A FLEX NOBODY ELSE CAN SEE IS NOT MUCH OF A FLEX. The obvious reading of
  "cool for an MMORPG" gear glow is showing it to OTHER PLAYERS, not only to
  the person wearing it — the whole reason a rarity ladder exists in a
  multiplayer game is other people noticing. Worth building even though the
  first pass (self only) already looked complete; a single-player-shaped
  version of a multiplayer feature is a smaller feature wearing the same
  name.
- A BROADCAST SHAPE ALREADY BUILT FOR ONE JOB CAN ANSWER A SECOND QUESTION
  FOR FREE. `Appearance` exists so every remote player's rig can be dressed
  identically to how the local player dresses itself, and in solving that it
  had already collected a rarity for every glowable slot — nothing about
  "what should this wisp system read" needed a new field once the actual
  question ("what is this player wearing") was asked of the right existing
  answer instead of reached for via three narrower gameplay-bonus fields.
- A VALUE A METHOD CONSUMES AND APPLIES IS NOT THE SAME AS A VALUE KEPT.
  `setAppearance` dresses a remote rig from the `Appearance` it is handed and
  retains none of it — right for its own job, wrong for a system that needs
  to ask "what is this player wearing" on every tick rather than only the
  frame a snapshot happened to arrive. `playerAppearances` exists because the
  consumer needed a copy the producer had no reason to keep.
- A SHARED TIMER BECOMES A COORDINATION BUG THE MOMENT A SECOND ACTOR NEEDS
  ONE. One `nextWeaponAuraAt` number was correct for a single player; adding
  remote players without keying it per-actor would have made every glowing
  character in view sparkle on the same tick, reading as one synchronized
  effect rather than several independent ones.

- A FIELD THAT EXISTS FOR A GAMEPLAY BONUS IS NOT A GENERAL ANSWER TO THE
  SAME QUESTION A VISUAL SYSTEM ASKS. `weaponRarity`/`armorRarity`/
  `bootsRarity` exist because those three slots' rarity feeds a stat
  formula (crit damage, XP, move speed); reading them for "what is glowing"
  would have silently limited a visual feature to three of seven slots for
  a reason that had nothing to do with the visual feature. The full,
  correct source for "what is glowing" was already sitting in `this.items`
  — every equipped piece, every slot, no extra wire field needed.
- A LIGHTER SIBLING METHOD BEATS REUSING THE HEAVY ONE AT A REDUCED SCALE.
  `bolt()`'s spark/glow/light/trail combo is right for one hit; calling it
  every 200-400ms for an ambient effect would mean a real point light
  strobing that often, which reads as broken rather than ambient regardless
  of how small the sprites are scaled. `wisp()` is a new, minimal method
  built for the cadence rather than the existing one stretched to fit it.
- MORE GLOWING GEAR SHOULD VISIBLY MEAN MORE, not just multiply which slot a
  fixed-rate wisp happens to pick from. Spawn rate scales with how many
  glowing pieces are worn (floored so it cannot become a strobe), so a
  character in a full glowing set reads as more radiant than someone with
  one glowing ring — the same relationship the mesh's own emissive lift
  already has, extended to the ambient effect riding on top of it.

- A VALUE ALREADY ON THE WIRE CAN STILL BE UNREACHED BY MOST OF WHAT COULD
  READ IT. `p.school` was never missing — it has coloured the floating
  number and chosen the log's verb since the school system existed — but
  `style.tint` answered the burst, the bolt and the beam from a completely
  separate table keyed by weapon FAMILY, and nothing ever asked whether the
  two should agree. A field being sent is not the same claim as a field
  being used everywhere it is relevant.
- FALL BACK TO THE WEAPON'S OWN TINT FOR PLAIN PHYSICAL HITS, rather than a
  fixed white/style-free default. Physical is a school like any other in
  this game's own vocabulary, but a sword's white and an axe's warm tan are
  part of what makes the WEAPON FAMILIES read differently from each other;
  collapsing them to one physical colour would have traded a real
  distinction for a smaller one.

- A METHOD NAMED FOR WHAT IT DOES, NOT WHO IT IS CALLED ON, WILL GET CALLED
  ON ONLY HALF THE ACTORS. `setChilled`/`setRecovering` live on `Actor`, the
  shared class both players and monsters use, and yet every call site was
  `vis.actor.___` for eleven milestones running — nobody had ever written
  `this.localActor.___`. The method being generic did not make its call
  sites generic; every caller has to be checked, not just the method.
- A DOT PULSES; A PLAIN CONDITION STAYS STEADY — the same rule `recovering`
  already established, applied one state over. `burning` ticks on its own
  clock and the signal has to say so; `chilled` is a state with no clock
  attached to it, and pulsing it would claim a rhythm that is not there.

- A PROJECTILE METHOD DOES NOT HAVE TO TRAVEL. `bolt()`'s spark-glow-light
  combination is what makes a magic missile read as hot; nothing about that
  combination requires the `from` and `to` it lerps between to be far apart.
  A near-zero flight turns the exact same call into a stationary flourish —
  the third reuse this session (a staff's own missile, the wand's muzzle
  flash, now a crit's point of impact) of one piece of proven geometry
  rather than three bespoke ones.
- A SPARKLE ON EVERY HIT IS NOISE; ON A CRIT IT IS A LANDMARK. The atlas
  burst already fires for every swing, so adding the new particle flourish
  there too would just be a brighter version of something already constant.
  Reserving it for the moment the game already treats as special is what
  keeps it meaning something.
- THE OUTGOING AND INCOMING SPARKLES ARE DIFFERENT COLOURS ON PURPOSE, same
  reason the gold self-flash and the red incoming-damage flash are: gold
  says "I did that," red says "that happened to me," and the two moments
  should never be colour-confusable mid-fight even for a fraction of a
  second.

- A FLAG THAT ALREADY GATES TWO READOUTS SHOULD GATE THE THIRD.
  `guaranteedDrop` already decides the framed nameplate and the target
  frame's elite border, both of which exist to tell a player they are
  looking at something worth the walk — and the payoff those two readouts
  build toward, the kill itself, was reading the flag from neither. Two
  places already asking the same question is the strongest sign a third
  place should be asking it too.
- SHAKE IS A BUDGET, NOT A DEFAULT. Nothing shook on an ordinary kill before
  this, only crits mid-fight — so a boss kill's shake had to read as bigger
  than a crit's (0.16/260 against 0.09/150 or 0.11/170) rather than reuse
  either number, or the rarest moment in the fight would shake the screen
  less than a lucky roll two swings earlier.

- A SIGNAL THAT LANDS EVERYWHERE EXCEPT ON THE PERSON WHO CAUSED IT IS STILL
  MISSING. Every crit signal — the gold number, the bigger burst, the shake —
  answers "what did this do to the target", and none of them answer "did I
  just land a crit" from the attacker's own point of view, which is the
  question they are actually asking when they glance at their own character.
- FIX THE GAP THAT IS ACTUALLY THERE, NOT ITS MIRROR. Being crit BY a monster
  already differentiates (bigger burst, its own shake); only landing one had
  nothing on the swinging body. Symmetry is not owed where one side was
  already answered.

- A NEW VISUAL BEAT CAN BE A CALL TO AN EXISTING METHOD RATHER THAN NEW
  GEOMETRY. The beam needed a moment marking where it left from; the staff's
  `bolt()` already IS exactly that moment, spark and glow and light together,
  proven to work. A near-zero-length flight reuses it as a muzzle flash for
  free rather than teaching `beamMesh` a fourth material.

- "SLOWER" HAS TWO COMPLETELY DIFFERENT MEANINGS IN THIS COMBAT SYSTEM, AND
  ONLY ONE IS SAFE TO GUESS. `swingMs`/`speedPxPerSec` decide when a blow's
  FX and number appear; `swingIntervalFor`/`attackIntervalMs` decide how
  often a swing can happen at all, and the second is the number the entire
  Phase 68 balance sweep solved against. Asked which one before touching
  either — a wrong guess here would have silently invalidated a balance pass
  that took three re-solves to get right the first time.
- A RAW-SOCKET TEST FAILING DURING A CLIENT-ONLY CHANGE IS A CLUE ABOUT THE
  TEST, NOT THE CHANGE. `fighting.mjs` imports nothing from `client/src/` —
  it drives the server over `ws` directly — so a client-only edit to
  `attacks.ts`/`Game.ts` cannot be its cause by construction. Traced the
  actual failure (a low-accuracy persisted character standing next to a
  38-evasion ghost) rather than either shipping past a red suite or chasing a
  regression that could not exist in the files just touched.

- CHECK A GEOMETRY'S UV CONVENTION BEFORE ASSUMING IT WILL GARBLE A TEXTURE.
  The instinct was that `RingGeometry` maps radially (angle/radius) and would
  need new UVs to take a texture authored for a flat square stamp — checked
  by building one in Node and printing `attributes.uv` against
  `attributes.position`, and it is already a plain `x/outerRadius/2 + 0.5`
  projection, the exact convention the source texture assumes. The assumption
  would have cost a UV rewrite that turned out to be unnecessary.
- A TEXTURE GOES ON THE SHAPE IT MEANS SOMETHING FOR, NOT ON EVERY CALLER OF
  THE SAME GEOMETRY. `mark` and `nova` share one `RingGeometry`, but only
  `mark` is about a condition landing on a body — a rune circle on
  Earthshatter, a physical shockwave with no school, would describe an
  element the skill does not deal. Shared geometry is not the same claim as
  shared meaning.
- RECORD A VERIFICATION GAP RATHER THAN PAPER OVER IT WITH A CONFIDENT LINE.
  The mark texture's live check never produced a clean isolated shot — the
  test camera's manual override kept losing to the game's own per-frame
  follow logic — so what actually got confirmed (the material renders and
  carries colour) is stated as exactly that, and what did not (a clean shape
  check) is named as a rig problem rather than implied to be settled.

- A GLOW IS A PROPERTY OF SOMETHING FLAT FACING THE VIEWER, NOT OF A SHAPE. A
  radial-gradient texture wrapped onto a sphere's UVs tiles around it instead
  of reading as light — spheres and cones are the wrong geometry for a 2D
  glow no matter how good the texture is. A sprite (or any camera-facing
  quad) is the only shape a soft gradient reads correctly on, which is the
  same reason `fx.png`'s impact bursts have always been camera-facing quads.
- TEXTURE THE GEOMETRY THAT ALREADY SOLVED THE REAL PROBLEM; DO NOT REPLACE
  IT. M64.1 moved projectiles OFF flat atlas quads specifically because they
  read as smudges at this camera's distance — real geometry plus a travelling
  point light was the fix. Downloaded particle textures are billboarded onto
  that same geometry/light/motion system rather than reverting to quads,
  which would re-open the exact problem M64.1 closed.
- A SPRITE'S OWN ROTATION IS A DIFFERENT KNOB FROM ITS PARENT'S. Spinning the
  old sphere's transform varied its silhouette as it flew; a sprite always
  faces the camera regardless of parent rotation, so that trick does nothing
  to one. `SpriteMaterial.rotation` — an in-plane spin — is what still gives
  a billboarded glow the same "turning as it flies" life without breaking the
  camera-facing property that makes it read as light in the first place.
- A TEXTURE'S GRADIENT AXIS HAS TO MATCH THE GEOMETRY'S UV AXIS, OR BAKE IT SO
  IT DOES. A cone's V runs along its length, U wraps its circumference; the
  source trail frame varied along U (image X), which would have painted one
  side of the trail bright and the other dark instead of fading it toward the
  tail. Rotated 90° once at bake time rather than fought with `texture.rotation`
  at runtime — the same "bake the geometry, don't reach for Euler angles at
  the last second" call this file already has on record.
- WHEN A VISUAL CHANGE SHOWS NOTHING, SUSPECT THE TEST RIG BEFORE THE CODE —
  the same rule this file already recorded about headless Chromium throttling
  rAF to about a frame a second. Here it was TWO rig problems stacked: a close
  third-person angle put the new sprite behind the character's own head, and
  the test scene happened to be a torch-lit wall bright enough that additive
  white-on-white produced almost no visible delta. A plain opaque test sprite
  at the same spot rendered instantly, which is what proved sprites worked at
  all and pointed at framing rather than the material.
- AN UNUSED DOWNLOADED ASSET NEEDS THE SAME DISCLOSURE A DEAD CODE PATH DOES.
  `ring.png` was picked for a follow-up (texturing `skillfx.ts`'s mark/nova
  rings) that did not make it into this pass — credited as reserved rather
  than as used, the same way `fx.png`'s own unused rows are documented rather
  than left to imply a caller that does not exist.

- A REPEAT ANIMATION REQUEST IS NOT ALWAYS A NO-OP. `play`'s guard against
  re-triggering a state that is already current is right for a snapshot
  loop calling `play("idle")` sixty times a second — but Agility's double
  attack sends two genuinely independent `BATTLE_RESULT`s back to back, and
  the same guard silently ate the second swing's pose because the clip was
  still mid-flight from the first. The fix is not a new mechanism, it is the
  `immediate` flag `play` already had for exactly this: a hard restart,
  which costs nothing on an ordinary single swing because that transition
  never shares the guard's branch in the first place.
- WHEN A GUARD MIGHT BE WRONG, CHECK WHAT IT ACTUALLY COSTS TO BYPASS IT
  RATHER THAN GUESS. `play("attack", true)` looked like it could reintroduce
  whatever the no-op guard was protecting against — but tracing the two
  branches showed the guard only ever fires when `prev === next`, which an
  ordinary idle-to-attack transition never is. Forcing it everywhere is free
  everywhere it wasn't load-bearing and correct exactly where it was.

- A COORDINATED EVENT WITH NO SIGNAL READS AS SEVERAL ACCIDENTS. Social aggro
  has flipped a whole camp into `chase` on one hit since the shout guard was
  written, and a player watching four bodies start moving on the same tick had
  no way to tell that apart from wandering into four separate aggro radii —
  the mechanic this file already exists to make plannable was invisible at
  the exact moment it happened.
- THE ONE THAT SHOUTED FLASHES TOO. Only marking the packmates it woke would
  say "these four just noticed you" and miss the more useful half: which one
  you actually hit is the one that raised the alarm, and that is the fact a
  player pulling carefully needs on the body they are looking at.
- A NEW CUE HAS TO BE UN-MISTAKABLE AGAINST THE ELEVEN ALREADY IN THE FILE,
  not just distinct in isolation. Every existing cue slides DOWN in pitch —
  a swing decaying, a hit landing, a thing dying — because all of them are an
  impact settling. A shout is the opposite motion on purpose: two short
  RISING snarls, so it cannot be misheard as a blow landing mid-fight.

- A DAMAGE MESSAGE WITH NO VISUAL OF ITS OWN READS AS A LAGGED COPY OF ONE
  THAT HAS ONE. A death burst applied real damage from a real radius and drew
  nothing, so a player caught in it experienced an ordinary hit landing a beat
  after the kill rather than the corpse's own parting shot.
- AND THE SAME MESSAGE WAS ALSO WRONG ON THE BODY. `MONSTER_ATTACK` always
  triggered the swing animation, and a death burst fires from inside
  `killMonster` a line before the status flips to dead — so the corpse lunged
  into an attack pose for a single frame before `die` cut it off. The fix is
  the same shape `windupMs` already uses to say a kind has no ordinary attack
  to re-trigger: a flag on the message, not a guess from timing.
- A DEATH-BURST RING BELONGS TO EVERYONE WATCHING, NOT ONLY WHOEVER IT HIT. It
  is drawn off the death-edge transition every client already has (kind, radius
  from the static table) rather than off the per-victim attack message, the
  same choice the wind-up danger ring already made — a corpse detonating is
  worth seeing whether you were close enough to feel it or not.

- A SPEED MULTIPLIER THE SERVER APPLIES IS NOT AUTOMATICALLY A SPEED THE
  PLAYER SEES. A leap has moved a monster at up to 3.4x its own pace since
  Phase 66 and the run cycle never knew: it played at its ordinary per-actor
  rate regardless, so the body covered three times the ground a stride should
  and the mismatch read as skating rather than committing to a distance.
- DERIVE A TIMED FLAG FRESH EVERY TICK RATHER THAN SET IT INSIDE ONE STATE
  BRANCH. `windingUp` and the new `leaping` both need to go false again on
  their own — a monster that leashes home or dies mid-leap must not carry a
  stuck `true` into its next several snapshots — and a flag set only where the
  behaviour starts has no path back to false when the monster leaves that
  branch first.
- A `play()` GUARD THAT STOPS A NO-OP RETRIGGER ALSO STOPS A LEGITIMATE RE-RATE.
  Re-entering `play("run")` on an already-running actor is correctly a no-op —
  a moving pack is not supposed to resync its footfalls every snapshot — but
  that same guard means a leap's speed boost cannot be applied through `play`
  at all. It has to be written directly onto the action's time scale, every
  frame, independent of the state machine that owns which clip is playing.

- A TELL HAS TO REACH THE THING BEING TOLD ABOUT. A boss's wind-up drew a
  ground ring, played a cast sfx and glowed a nameplate bar, and the creature
  itself just stood in idle or kept running until the slam landed — a player
  actually looking at the troll rather than the floor under it saw nothing
  change for the whole two seconds the mechanic exists to be read in.
- STRETCH THE CLIP THAT ALREADY EXISTS RATHER THAN ASK FOR A NEW ONE. The
  attack animation these three kinds already had is real geometry winding up
  and swinging through; playing it at `clipDuration / windupMs` speed instead
  of its own native one makes the wind-up visible on the body with no new art,
  timed to finish exactly as the hit resolves rather than snapping out all at
  once on impact.
- A TELEGRAPHING CREATURE HAS NO ORDINARY ATTACK, and this file already said
  so about the damage: every `MONSTER_ATTACK` a troll, golem or dragon sends
  is the slam, so replaying the swing again at impact time was always a second
  copy of the same event — it just used to be the only one anybody saw.

- BEING HIT IS THE STRONGEST REASON TO FIGHT SOMEONE, AND IT WAS THE ONE REASON
  THE AI DID NOT HAVE. Damage woke every packmate of the creature you shot and
  skipped the creature itself; aggro reached your actual target only by walking
  inside its perception radius. Whenever a rule wakes BYSTANDERS, check that it
  wakes the subject first.
- HOW FAR SOMETHING NOTICES A STRANGER IS NOT HOW FAR IT CHASES SOMEONE SHOOTING
  IT. One constant answered both questions for a long time, and the answer to
  the first is smaller than a bow's reach. Two questions, two numbers. And no
  reach in the game may exceed the distance the target is allowed to follow, or
  the fight is decided by a range chart rather than by play.
- WHAT BOUNDS A CHASE IS THE LEASH FROM HOME, NOT THE GAP TO THE PLAYER. The
  leash already existed and already worked; the give-up radius was a second,
  wrong answer to a question that was not being asked.
- A PROBE THAT ASKS "DID IT MOVE" PASSES ON A MONSTER WALKING AWAY. Moving is
  what both the right and the wrong behaviour look like for the first two
  seconds. Measure the thing you actually want — that it ARRIVES.
- MUTATION-TESTING AN UNCOMMITTED FIX CANNOT REVERT WITH `git checkout`, because
  the fix is the working tree. Copy the file aside and restore from that.
- A SKILL MUST DRAW SOMETHING AN AUTO-ATTACK DOES NOT. Every skill paints the
  school's impact burst on what it hits, and so does an ordinary swing — so six
  melee skills with `shape: "none"` were things the player could not tell they
  had pressed, including the two that set up the 140% multipliers. `none` stays
  right for anything ranged, which throws a visible projectile, and for a dash,
  which is a roll.
- A MARK CONVERGES; A NOVA RADIATES. The direction is the meaning: a nova comes
  out of a point because something happened there, and a mark closes onto a body
  because something is being done to it. Camera-facing rather than flat, because
  a ring at the feet describes a patch of ground and these skills are about the
  creature standing on it.
- A SHARED SIGNATURE IS A VOCABULARY, NOT A UNIFORM. Four single-target debuff
  appliers share the inward ring so "a condition just landed" is one thing to
  learn — but Rend is a slash that happens to bleed and its cone is already
  unmistakable, and a rule that forced it in would be reaching into a case it was
  not written for. Assert that the signature is worn by more than one skill, not
  that it is worn by all of them.
- A CONDITIONAL YOU CANNOT SEE IS ONE YOU WILL NOT PLAY AROUND — and this file
  already said so about the empowered flash, which fires after you have
  committed. Eight skills read a status for up to 140% more damage and the only
  way to play them was to remember which wanted which and press in time. The bar
  lights the slot now, at the moment the decision is made.
- THE LIGHT ASKS THE SAME FUNCTION THE DAMAGE DOES. `findRead` decides both, so
  what the bar promises and what the server pays cannot disagree about whether a
  condition counted.
- A slot that says "press me" and then refuses is worse than one that says
  nothing, so it stays dark when the mana is not there.
- A READER'S CONDITION MUST BE REACHABLE. A skill that reads a status nothing in
  the game can apply is a slot that never lights and a bonus that can never be
  spent — the same dangling limb `salvage` was before a quest pointed at it, and
  `shape: "none"` was on three missiles.
- Anchor a source check on the RECEIVER. `/setConditions\(/` matches
  `noop_setConditions(`, so the mutation written to break that check passed it.
  A check that looks right and is worth nothing is the reason mutations get
  written at all.

- A MODEL MUST SPEND STAT POINTS WHERE THE GAME SAYS TO. `statAdviceFor` is the
  priority order the character sheet prints; a model that ignored it gave a
  swordsman zero agility and reported warriors at a sixth of a ranger's damage.
  The spread across weapon families went from 6.9x to 3.4x the moment the model
  followed the game's own advice — and a whole stat-system rebalance was nearly
  argued from the difference.
- A BALANCE NUMBER SOLVED AGAINST A WRONG MODEL IS A WRONG NUMBER. M68.2's slam
  multipliers were swept against that same too-squishy character, so they landed
  at 16-26% instead of the ~30% they were chosen for. Fixing a model means
  re-solving everything solved with it, not just re-running it.
- KEEP THE CURVE, not just the chosen point. A number picked off a measured
  sweep can be re-picked by somebody else for a stated reason; a number that
  sounds right can only be argued about.
- A TELEGRAPHING CREATURE HAS NO ORDINARY ATTACK. The tick winds up, lands the
  slam and `continue`s, so a troll, a golem and a dragon land nothing else — and
  therefore a player who reads every telegraph takes NOTHING from the three
  biggest things in the world. Against them the whole fight is whether you move.
- WHICH MAKES THE MECHANIC'S VALUE EXACTLY THE COST OF IGNORING IT, and that was
  8% of a health bar on a troll. The oldest skill expression in the game was
  decoration on two of its three users, and nothing said so because a fight you
  win is not a fight anybody investigates.
- ARMOUR SUBTRACTS AFTER THE MULTIPLIER, so a big multiplier on a small base is
  mostly eaten — 8-16 at x1.7 is 14-27 against 14 armour. This is why the fix is
  three different numbers and why the DRAGON'S is lower than the troll's: a
  creature that already hits hard needs less compensation. The inversion is the
  finding, not an inconsistency.
- SOLVE A BALANCE NUMBER, do not pick one. The simulator sweeps the multiplier
  and prints what each costs; choosing from a measured curve is a different act
  from choosing a number that sounds right, and the curve stays in the file so
  the next person can choose differently for a stated reason.
- THE ONE RULE THIS WORLD IS LAID OUT BY IS TESTABLE. "Distance from spawn is
  difficulty" had been tuned entirely by argument for sixty-odd phases and never
  once checked, and it did not need to be played through to check: `resolveHit`
  is pure, the stat curves are pure, the catalogue is a table, and a fight is a
  loop.
- A BALANCE MODEL MUST SAY WHAT IT LEAVES OUT. No skills, no potions, no
  statuses, no crowding — deliberately, because those are what the PLAYER brings.
  What is measured is the floor; if the floor holds, the ceiling is their
  business. A model that quietly included half of them would be a claim.
- And it must say what it CANNOT know. A thrower does not stand still, so
  simulating an approach and then a stationary exchange measures the opening walk
  and nothing else. Those numbers are a lower bound and the file says so.
- A REPORT MUST PRINT WHO IT SIMULATED. A balance table nobody can check is a
  table nobody should believe — and the debugging pass that skipped this
  reimplemented the character in a scratch script, put the stat points in the
  wrong attribute, and drew conclusions about somebody the suite had never built.
- NEVER DEBUG A SUITE BY REIMPLEMENTING IT. Instrument the thing itself. Every
  reimplementation is a second chance to be wrong in a new way, and it was.
- AN IMPOSSIBLE RESULT IS THE SIMULATION REPORTING ON ITSELF. "Loses 100% of the
  time at full health" cannot happen in the game, so it was never about the game.
  NaN makes every comparison false, which stops a loop silently and looks like a
  decisive outcome. Guard the arithmetic and throw.
- ONE EXPRESSION FOR TWO SITUATIONS IS A BUG WAITING. The approach used the
  difference of two speeds for every creature, so an armabee at 215 against a
  player's 220 was modelled walking away from somebody it was charging at — a
  43-second stroll, and the suite failed the creature for it. A melee monster
  closes at the SUM; only a thrower closes at the difference.

- A STATE NOBODY PLAYS IS AN ABSENCE, and an absence is indistinguishable from a
  decision not to have the feature. `Roll` and `PickUp` were harvested, bindable
  and unreachable for ten phases, so a dash was a character sliding sideways in
  its running pose and picking something up was walking over it. Binding a clip
  is not using it; the test checks for a CALL SITE.
- A ROLL IS THE ONE ONE-SHOT MOVEMENT MAY NOT CANCEL. Every other is interrupted
  by running deliberately — a planted swing pose while the character travels is
  the sliding that rule exists to stop — but a dash IS travel, so cancelling on
  the movement it causes plays the clip for one frame.
- A MECHANIC WITH NO FEEDBACK IS A MECHANIC NOBODY LEARNS. The `recovering`
  window is the one genuinely skill-based thing in the fight and its only signal
  was a nameplate pip — so a player who had not been told would read it as the
  boss randomly taking more damage sometimes, which is indistinguishable from a
  lucky roll. It glows and the log says it once, on the edge.
- A PULSE SAYS A CLOCK; a steady tint says a state. When the whole information
  content is "this is running out", the signal has to be the one that conveys
  time passing.
- Sweep for capability wired to NOTHING, rather than finding it by accident three
  milestones running. What a runtime library holds cannot be read statically —
  the clips come out of five binary FBXs — so it needs a debug handle, which is
  the same argument `__wieldboundAudio` was added under.
- And a reachability grep is wrong in three specific ways, all of which reported
  working features as dead: it cannot see a name reached through a TERNARY
  (`playSfx(crit ? "crit" : "hit")`), it cannot see one reached through a
  VARIABLE (an effect chosen by school), and a regex for a block that ends `};`
  will not match one that ends `} as const;`. Over-count rather than under-count
  when the question is "is this reachable at all".
- A SKILL IS POSED BY WHAT IT IS, not by what is in your hand. One
  `play("attack")` served all forty-three, so a sword user pressing Mend did a
  sword swing while `Spell1` sat in the pooled library reachable only as a
  wand's ordinary attack. What you hold decides how you SWING; what you are
  doing decides whether you swing at all.
- BUT THE POSE STILL READS THE WEAPON, because a bow is its own delivery.
  Archery must not be a spell cast — the draw is the right animation, and
  casting one to fire an arrow is the same mistake in reverse. Fourteen skills
  a bow looses are ones a staff casts, and a rule where that number is zero is
  a rule not reading the weapon at all.
- A channelled cast HOLDS its pose for the length of the bar. A character
  standing in their idle for three quarters of a second and then throwing
  something has not cast anything, they have paused.
- THE SAME REACTION NEEDS DIFFERENT GATES ON A PLAYER AND ON A MONSTER, and
  forcing one rule on both cannot work. A player's health grows far faster than
  anything's damage, so a share of health is 12% for a burn tick at level 1 and
  4.3% for a troll's SLAM at level 40 — too loose where it locks you and too
  tight where you would never react again. A monster's problem is magnitude (a
  dagger must not rock a troll); a player's is frequency (3.1 interrupts a
  second). Gate each on the one that is actually wrong with it.
- A DAMAGE-OVER-TIME TICK STAGGERS NOBODY, and that is categorical rather than a
  threshold — you do not stagger from a burn. Enforced by WHERE the call sits:
  real blows arrive as `MONSTER_ATTACK`, which the burst, the slam and the swing
  all send and a tick does not. Hoping a tick falls under a share is not the
  same statement and is false at low level.
- A SOURCE TEST MUST STRIP COMMENTS FIRST. Two checks failed against a working
  game by matching the prose that explains the code they were looking for. A
  ruler that reads comments is measuring the documentation.
- Find the end of a function by COUNTING BRACES, never with a non-greedy regex
  to a closing brace at some indent — it stops at the first line that looks like
  one. A mutation was applied, confirmed present in the file, and the suite
  passed anyway.
- And check that a MUTATION LANDED. `String.replace` takes the first occurrence,
  so an anchor that is not unique quietly edits a different method — twice in a
  row here the conclusion "the test does not catch this" was itself wrong.
- A flinch needs a THRESHOLD and a COOLDOWN or the animation eats the fight. A
  dagger lands three blows a second; reacting to each would leave anything
  fast-attacked permanently mid-stagger and never swinging back. Seven per cent
  of the creature's own health, which is the same measure the floating numbers
  size by, plus 900ms — and a crit always shows, because that is the moment the
  player most wants acknowledged and it is rare enough to be safe.

- A CREATURE IS PROMOTED TO RANGED ONLY WHERE ITS OWN TEXT SAYS IT THROWS. Four
  kinds dealt a non-physical school from contact range while the comments beside
  them said "a demon is made of the fire it throws" and "the thing that throws it
  back at you". The ghost stays melee because its line says a cold TOUCH — the
  discrimination is what keeps this a fix rather than a redesign.
- A BACKPEDAL MAY NEVER MATCH THE PLAYER'S SPEED. A creature that gives ground as
  fast as you advance is one you can never reach, and that is not a fight, it is
  a chore. Closing always has to work; what it costs is the hits on the way in.
- Only the FRONT RANK gives ground. An overflow monster is already holding a
  wider ring and circling it, and backing off from there walks the whole queue
  out of the fight.
- No more than half the bestiary may throw. A world where everything kites is a
  world with one fight in it, which is the complaint this answers inverted —
  closing the gap is only a change of pace while most things still walk in.
- A ranged attacker WITHOUT A VISIBLE PROJECTILE is worse than a melee one. Fire
  damage arriving from something across the clearing with nothing in between is
  less legible than a thing that touches you, which at least is visibly touching
  you.
- Measure where a creature CHOOSES to stand by standing still, not by walking at
  it. A probe that chased the whole time reported the gap reaching contact and
  called it a failure — but the player moves at 220px/s and a cactoro gives
  ground at 62, so running one down is the intended outcome. The two questions
  are separate and need separate measurements.
- A dead monster keeps its ID and its replacement snaps home, which from a probe
  reads as an enormous instant retreat. A settled gap of 448px was a cactoro
  being killed by an attack order left standing from the previous run. Let orders
  lapse before measuring, and abandon a run rather than averaging a teleport into
  the answer.

- IDLE IS NOT STILL. Every creature in the game stood on its spawn pixel for the
  life of the world, which is the same defect as grass that never moved and
  townspeople who never walked: what reads as alive is motion with intent, and
  the absence of it throws nothing and looks like nothing being wrong.
- A BOSS DOES NOT WANDER. The three things with a guaranteed drop are what a
  player walks a long way to find, and one standing sentinel where the stories
  put it is worth more than one milling about. Keyed off `guaranteedDrop`, so it
  is the same flag that already means "this one is special".
- A WANDER NEEDS A LEASH, and the test checks it rather than the code asserting
  it. Distance from spawn IS difficulty here, so a camp that drifts without a
  bound walks out of its own band over an afternoon — and nothing would ever say
  so, because each individual step is tiny and legitimate.
- The back rank CIRCLES rather than standing. A semicircle of monsters holding
  station at a polite distance reads as the pack being broken; circling reads as
  waiting, which is exactly what the melee cap has them doing. Direction is fixed
  per creature from its id — picking one per tick jitters on the spot, and a
  whole ring turning the same way is a carousel.
- Measure a camp from SPAWN, touching nothing. Walking out to watch puts
  creatures in aggro and measures a chase, which is the one behaviour the probe
  is not asking about.

- A PROJECTILE HAS TO BE SIZED IN PIXELS, not in units. One world unit is about
  fifteen pixels at this camera, so a 0.07-unit arrow trail is ONE pixel and a
  0.05-unit beam core is one pixel inside a two-pixel glow. Readability beats
  proportion here, which the arrow's own comment already said and had not
  followed far enough.
- Half of a projectile is LIGHT. Low-poly geometry at this distance catches
  almost nothing, so a bolt that is only a mesh reads as a coloured pebble; one
  carrying a real point light reads as glowing, and at night it lights the
  ground it passes over.
- A trail is a CONE, not a box. What a fast thing leaves behind is wider where
  it has been.
- A ranged skill throws what your WEAPON throws, read off the same
  `ATTACK_STYLES` the ordinary attack uses. The alternative was a `bolt` shape
  added to eleven rows of `SKILL_FX` — a second table saying the same thing,
  which would disagree the first time either moved. It is also the rule this
  game is named for, one system across.
- `shape: "none"` on a MISSILE is a missile that does not exist. `arcanebolt`,
  `firebolt` and `frostbolt` — the three signature caster spells — threw
  literally nothing for the life of the skill system, and the only thing that
  happened was a burst appearing on the target.
- The damage number waits for the projectile. A blow counted before its own
  arrow arrives is the exact defect Phase 47 fixed for the auto-attack, and a
  skill was free to reintroduce it because it drew its travel separately.
- A CAST IS THE ONE COMMITMENT THE PLAYER MAKES rather than receives. Standing
  still is dangerous — that is what the telegraph is for — so a cast turns "is
  this the moment" into a real question, and it pairs with the window a big
  creature leaves after it commits a swing.
- Who casts is DERIVED from the cooldown, because that is already this game's
  measure of how big a skill is. Ranged only (standing still in melee while a
  troll winds up is a death sentence with no counterplay), damage and heals only
  (a survival cooldown you must plant your feet for does not work, and a dash
  with a wind-up is not a dash), and not the cheap spammable ones that carry the
  rhythm.
- The cast starts BETWEEN the last validation and the first commit. Earlier and
  a player channels then learns they cannot afford it; later and they are
  charged for something they can still walk out of.
- A completing cast RE-ENTERS the whole check, so running dry or dying mid-cast
  does not hand out the spell for free — and it must not pay the global cooldown
  twice. The GCD is 900ms and the shortest cast is 500ms, so charging it again
  on completion refused the spell at the exact instant it finished channelling:
  the bar filled, the cast ended clean, and nothing came out.
- A second press mid-cast is REFUSED, never queued. A queue makes the button you
  pressed and the thing that happens two decisions a second apart, which is the
  opposite of what a cast is for.
- The cast bar is driven by a CSS transition handed the duration, not by a frame
  loop. It cannot drift against the server's clock, and a bar that lies about
  how much time is left is worse than no bar because the player plans around it.
  An interrupted one freezes where it got to, which is the fact they want.

- YOU DO NOT SWING AT SOMETHING BEHIND YOU, and "behind you" and "running away"
  are the same state in a game with no strafe animation and no separate facing
  input. The threshold is a dot product of -0.35 rather than 0: at exactly
  sideways a heading's own wobble switches it on and off, and a swing timer that
  stutters while you strafe is worse than either behaviour. Circling, closing at
  an angle and sidestepping a telegraph all keep the fight; running more than
  110 degrees away drops it.
- The rule is stated ONCE in `shared/`, because the server decides whether the
  swing lands and the client decides which way the body points. Two thresholds
  give you a character facing its target and not attacking, or attacking and not
  facing — the two halves of the reported bug, one each.
- Derive a heading from consecutive POSITIONS, smoothed and stamped. `MOVE`
  carries a place and never a facing, one step at fifty updates a second is a
  few pixels of mostly-noise, and a heading with no recent step behind it is a
  stale opinion about somebody standing still.
- A DODGE HAS TO PAY, not merely spare you. The telegraph has existed since
  Phase 42 and the whole reward for reading one was not being hit, which is a
  punishment avoided rather than a play made — a fight whose only skill is "do
  not stand in the bad circle" is one you can lose but not one you can be good
  at. `recovering` makes the two seconds after a big swing the best two seconds
  you will get on that creature.
- The opening lands whether the slam HIT OR MISSED. Only-on-miss pays the player
  twice for one dodge; only-on-hit rewards standing in it. It threw its weight
  either way.
- A window has to close while you are still thinking about it. 2.2 seconds at
  x1.5, not ten seconds at x1.1 — short and strong is a decision to play around,
  long and mild is a debuff you never notice.
- An ALLOW-LIST ENTRY IS A CLAIM, and a claim with a plausible sentence beside it
  is exactly the shape of a thing nobody re-reads. `statuses.mjs` carried
  `shielded: "Shield Wall"` on its list of rows applied from outside the skill
  table, and it was false for the entire life of the skill. Every entry is
  checked against the real server source now.
- `applies` defaulting to something is how one skill silently becomes another.
  `useSkill` reads `skill.applies ?? "enraged"` — right for War Cry, wrong for
  everything else — so Shield Wall granted +35% damage DEALT while its own row,
  `damageTakenMultiplier: 0.5`, sat in the table unreachable. The description,
  the blurb and the icon all described a brace; the only thing that did not was
  the effect.
- ONE FUNNEL for everything that hurts a player. Four paths did it and only two
  composed the damage-taken multipliers, so a brace did nothing against the two
  biggest hits in the game — a telegraphed slam and a death burst. The
  ordinary-swing path even carried a comment saying the bespoke branch had been
  generalised, which was true there and nowhere else.
- Mana regen must not sit behind a HEALTH gate. It did — below an
  `if (hp >= maxHp) continue` — so a player at full health never regained a
  point, and the only way to get mana back was to be injured. Two lines below
  it, the comment said mana "comes back on its own clock, unlike health".

- EVERY WEAPON FAMILY GETS AN OPINION ABOUT WHAT THINGS ARE MADE OF. Measured:
  an axe could not deal a single element by any route — no weapon at any band,
  no skill anywhere in its tree — and nor could fists, while a sword reached one
  at band 4 and a mace at band 5. Four of eight talent trees were locked out of
  the deepest system in the combat design, and the two caster families had all
  five elements from tier 0.
- The fix is WEAPONS, not skills. A fireball in the axe tree is a mage's skill
  with an axe icon on it; an axe made of ember is an axe. That is what the three
  independent axes are for — mesh, palette, rarity — and it is exactly how Storm
  was added in Phase 50: an existing model and an existing palette, no artist.
- An elemental weapon carries NO stat mods over its band's neighbours. The
  element is the entire difference, and it cuts both ways — a fire axe against a
  demon at +50 fire is much worse than a plain one — so it is a sideways choice
  rather than an upgrade, which is what "within a band the choice is what you
  want to BE" already said.
- AN ELEMENT MAY NOT ARRIVE LATER THAN THE THING IT ANSWERS, and that rule was
  already written down — inside `Levinbrand`'s own comment, applied to lightning
  and to nothing else. Measured against it, fire was one ring late, nature two
  and frost four.
- Fists stay physical by construction rather than by exemption: bare hands are a
  real archetype here and there is no item to make them out of. `WEAPON_TYPES`
  already excludes them, which is why a hand-written "skip fist" guard in the
  test was dead code that printed `7/6`.
- The dev-only contact sheet takes `?sheet=weapons`; its default is the full
  armour sheet. A round went into restarting Vite on the theory that it was
  serving stale modules — the failure this log already records — when the URL
  was simply wrong. Confirm what you asked for before concluding the answer is
  stale.

- THE PROVISIONER TAKES MATERIAL AND NEVER ITEMS. "He only sells, never buys"
  reads as a missing feature and the obvious version of it is a downgrade: a
  counter that turns an unwanted sword into materials is salvage without the
  half that teaches you the recipe, which is the best loop in the item system
  and the one nobody finds unaided. Raw material is a different trade and it
  answers a shortage that can be measured.
- The shortage is REAL and it was measured before anything was built: across the
  whole catalogue, demand runs wood 35% / ore 56% / herb 9% while a full sweep of
  every node yields 50 / 38 / 12. Ore is the bottleneck by a factor of two, so
  everyone ends up holding wood and herb they cannot spend.
- The rate is 4:1 and STEEP ON PURPOSE. Near par the exchange deletes the
  bottleneck, and the bottleneck is the reason to walk to the far rings where the
  rock is — which is the whole shape of this world. It is a safety valve for
  being twelve ore short, not a supply line.
- One rate in every direction, not six weighted by scarcity. Six numbers to keep
  true against a catalogue that moves, buying nothing, because nobody trades
  toward the thing they already have a pile of.
- ESSENCE IS NOT TRADEABLE, and the greeting that said it was is now wrong twice
  over. Essence comes only off kills, which is what stops the top of the reforge
  ladder being reachable by standing at a tree; a counter that sold it for wood
  would be that exact back door wearing a fourth row.
- A trade message carries an OFFER ID and nothing else. `{ from, to, give, get }`
  is a packet the client writes its own exchange rate into; the id means the rate
  and the batch are only ever decided in `shared/shop.ts`.
- Six new options is a SUB-MENU, not six more rows. The vendor list is already
  nine lines and this file has an argument on record about not becoming a shop
  window — and the swap-the-list mechanism already existed for taking a quest.
- A test must assert its PRECONDITION, not assume it. The counter's range check
  passed on a fresh character and failed on a seeded one against a working game,
  because position is persisted and the second run began standing at the counter:
  "nothing may happen at range" had become "nothing may happen".

- HALF THE BACK YARDS IN EMBERHOLD CANNOT BE SEEN, and that is a fact about the
  camera rather than about the town. This game has one bearing, so "behind" is
  permanent — the rule the monument's sight line already runs on. A yard is
  further from the centre than its building, so for the three houses on the
  up-screen half of the ring it sits behind its own walls from everywhere. Not a
  fault to fix; a fact to spend effort by.
- A BACK YARD SAYS WHAT THE BUILDING IS, and counting props cannot tell you
  whether it does. Two rulers said the chapel's was the fullest in town while a
  person looking at the game said it was the emptiest, and both were right: of
  the three yards that are visible, the chapel's held a washing line and a water
  butt against a pell and a hayrick. The check that means anything is whether a
  yard has something of its OWN — a kind no other building also has.
- Placement that is stated in PROSE is placement nothing is checking. The second
  washing line is commented as "the two cottages' between them" and was typed at
  84 and 96, six degrees off a chapel with no beds in it. A back-lane prop names
  its building and the bearing is DERIVED, so being behind the wrong one is a
  spelling mistake rather than a plausible number.
- Everything PLACED must be DRAWN, and the client may not keep a hand-typed list
  of what to draw. Four rain barrels were listed by name and the shop's yard
  gained a fifth; a barrel that is not rendered looks exactly like a barrel
  nobody asked for while still being something you walk around. Read the table.
- Bake a lean and a stack into the GEOMETRY, not into Euler angles. `Builder.add`
  composes rotX, rotY and rotZ through one Euler, and whether "turn it then tip
  it" and "tip it then turn it" agree depends on an order not worth reasoning
  about — the first grave markers came out as three little anvils with their
  caps sideways. Rotating the geometry about a shared local origin glues the
  pieces together by construction and leaves only the bearing to apply.
- A prop's COLOUR decides what it is mistaken for, before its shape does. Four
  pale rounded sacks in `linen` beside the crates photographed as boulders, and
  a rock is the ore node's silhouette — the same rule that keeps the ground
  cover from resembling a resource node. Straw-coloured and taller than wide,
  and the confusion goes away without a single vertex moving.
- Check the angular-separation formula before believing anything it says. The
  first pass had a spurious `180 - d` in it and reported a prop at bearing 36 as
  nine degrees from a building at 225 — it was returning the supplement, and
  every conclusion drawn from that pass was noise.

- A GROUND MARK FOLLOWS THE GROUND PER VERTEX; a single tilt is not a smaller
  version of the same fix, it is a fix that runs out. The contact shade is 1.3
  units across and a plane fits it to 3mm, which is why M56.1 tilted it. A reach
  ring is ten units across and a slam telegraph five, and at those spans a plane
  is still 0.55 and 0.15 units buried at p95 — a third of a character on the
  thing the fight is about. Chord error grows with the square of the span, and
  these are the widest flat objects in the game.
- The TELEGRAPH is the one that decides it. Photographed on the steepest ground
  in the bands, a flat slam marker is a sliver and a flat reach ring a crescent —
  most of both is inside the rise. The troll's entire design is an attack you
  answer by stepping out of it, so a telegraph that only draws the near third of
  itself is the mechanic not working rather than a cosmetic fault.
- A literal `0` for a ground Y is correct until the day the ground stops being a
  plane, and then it is wrong everywhere and nothing says so. Five skill shapes
  kept theirs across six phases of relief; measured, that is more than half a
  character off the ground across 28.9% of the play area. `onGround` exists
  precisely to be spread into these calls and the comment saying so was already
  there.
- An exception to a rule must carry its REASON in the test. `terrainHeight` is
  not a bug — a dragonfly over the Coldwater belongs over the water and not over
  the bridge deck, and a rooted plant slightly under the drawn mesh is what
  rooted looks like. Listing those with reasons is what makes the next person
  reaching for the smooth field argue in the suite rather than in a diff.
- Assert that a rule is LOAD-BEARING, not only that it is obeyed. Every check
  about which height function to read is vacuous if the two agree, so the suite
  measures the gap and fails when it closes — which turns "the mesh got finer,
  delete this rule" into a deliberate act instead of an accident.
- Guard a per-vertex rebuild against not having moved. It runs from the render
  loop and standing still is the common case; the same guard the soundscape's
  ramps needed. Worst case measured at 0.54ms of a 16.7ms frame with all five
  rings rebuilding every frame, and the common case is one of them.
- FREEZE THE HOUR, THEN STOP THE LOOP — never the other way round. `freeze` only
  sets a field; the value is applied by `update`, which runs from the game loop,
  so a probe that stops the loop first pins whatever hour was already on screen.
  A riverbank measurement came back with every sample near-black because the
  frame was at 23:15, and nothing about the numbers said so.
- Two jobs in one constant is a reason NOT to tune it. `RIVER_BANK_UNITS` sets
  both the width of the shingle band and how far the bank climbs to its crest,
  so narrowing it to answer "the sand reads wide" would flatten relief that was
  deliberately measured up in M53.4. Measured first, found the band already ends
  within 3.2 units of a waterline on a river 7.5 across, and left it alone.

- "KILLED IT WITH" MEANS MOST OF YOUR DAMAGE, never the killing blow and never
  any of it. The killing blow is the one thing in a fight the player does not
  choose — swings are on a timer, dots tick on their own clock, a volley lands
  over half a second — so keying a technique on it is a dice roll wearing a
  technique's clothes. "Any of it" is satisfied by one firebolt inside a
  thirty-second sword fight, which asks for nothing. Most of it means the quest
  is satisfied by FIGHTING AS the element, and it is the loot rule one level
  down: the same accumulated-damage table already decides who a drop belongs to
  by asking who did most.
- A DEBUFF IS NOT DAMAGE, so the school argument is optional rather than
  defaulted to physical. The token point a debuff adds for acquiring a target
  would otherwise credit somebody who marked a thing and then burned it to death
  with a physical kill, on a one-point tie.
- A dot carries its OWN school into the threat split. `Immolate` lands small and
  deals most of its damage as ticks, so a dot that did not would make the one
  skill built for burning things the worst possible way to be credited with
  burning one.
- Move a rule to `shared/` BEFORE it has produced three reported defects.
  `dominantSchoolOf` is a rule of the game in the sense every formula in
  `protocol-types.ts` is one, the server was its only caller and therefore the
  only place it could be wrong, and nothing offline could reach it inside
  `index.ts`. This is M57.3's lesson applied without waiting for the bill.
- WHETHER SOMEBODY HAS WORK IS A FACT OF THE QUEST TABLE, not of their role.
  `role === "quest"` is a second opinion about the same thing and was wrong the
  moment a guide was given a line of work. `role` says what a person IS — Elsbet
  keeps the guide's portrait and plate — and `questsFrom` says what they have.
  Same call as reading the fires off the tables they are placed from.
- A rule the game has never asked anybody to USE is a rule most players will
  never learn. Damage has had six schools and thirteen creatures with opinions
  about them since Phase 48, all of it resolved, drawn, tooltipped and logged,
  and a player could finish every quest in Emberhold without discovering any of
  it. Showing a system is not pointing at one — the same gap `salvage` had until
  a quest said it out loud.
- An element in a quest is never PHYSICAL. Physical is what a blow is when
  nothing has an opinion about it, so a physical objective is satisfied by
  accident by most characters in the game and teaches nothing. Asserted rather
  than left to the type, because a type is only as good as the next person who
  widens it.
- A pair in a quest must be a real WEAKNESS in the table, read out of
  `MONSTER_STATS` by the test and never trusted from the prose. "Burn the demon"
  is a quest that can be finished and should never have been offered, and it is
  what a retune of one row produces silently. Zero is not good enough either: a
  creature with no opinion either way teaches that the system does nothing.
- Test the WORD, with boundaries. The check that a brief names its own element
  passed a brief with the element deleted, because "a staff learns a firebolt"
  contains "fire" — the assertion was being satisfied by a spell name rather than
  by the instruction. Every element here is a prefix of one of its own spells, so
  that is the normal case rather than a corner of one.
- A live probe against an AUTO-BATTLER may not assert an exact count. An attack
  order stands until you walk away, so a phase kills however many it kills;
  "+1 per kill" failed against a working game. Assert the SIGN, and report what
  the phase actually DEALT — the first run fought bare-handed because the mace
  would not go on over an off-hand and nothing said so.

- A HEIGHT FIELD MAY NOT STEP, because what you see is a mesh sampled off it on
  a 1.63-unit grid and a mesh cannot draw a step — it draws a wedge across
  whichever quad the step falls in. `rampToBridge` had one branch, `if (along <=
  BRIDGE_HALF_SPAN_PX) return h`, which left riverbed under the deck and ramp
  outside it; the mesh drew that as a 1.27-unit trench off the end of the
  planks. The fix is not a smoother step, it is having no branch: one expression
  covering the channel, the landing, the ramp and the open field.
- A bridge lands on an ABUTMENT. The deck overhangs the bank by 170px at each
  end and that overhang is solid ground at deck height — the file already said
  the deck "only has to span the water", and now the ground says it too. The
  height five pixels inside the abutment and five pixels outside it have to be
  the same number, and asserting exactly that is the whole test.
- A STEP IS NOT A SLOPE, and a first difference cannot tell them apart. The
  north bank climbs 0.19 units every 25 pixels for hundreds of pixels — an
  eighteen-degree hillside that is supposed to be there — so a threshold low
  enough to catch a trench is low enough to ban hills. A discontinuity lives in
  the SECOND difference: flat for any slope however steep, spiking for any break
  however short. Trench 1.79, real land 0.08.
- Code that keeps producing reported defects and cannot be tested should be
  MOVED until it can be. The height field caused three faults in four phases —
  walking through the bridge, feet in the floor, a trench at each abutment — all
  three found by a person walking into them, and none reachable from
  `tools/test/` because the functions lived in a module that pulls in three.js
  and a DOM. `heightfield.ts` is the same arithmetic with no renderer in it and
  explicit `.ts` extensions on its shared imports, which Vite ignores and Node
  requires.
- Making something testable must not make it AUTHORITATIVE. The height field
  stays in `client/` rather than moving to `shared/`, because the decision that
  made height free in the first place is that nothing in the simulation reads a
  Y. A test needs to import it; the server still must not.
- Verify that a new test FAILS on the code it was written for. Reverting
  `rampToBridge` to its old branch fails six of the crossing's checks; a suite
  that passes both before and after a fix is a suite that restates the game
  rather than testing it.

- A scatter is a DENSITY, never a headcount — and the ambient pool is a scatter
  even though its neighbourhood moves. This decision was already in this log for
  the treeline and the ground cover and `ambience.ts` did not have it, which is
  how one milestone cut the butterfly count in half, cut the neighbourhood's AREA
  by eight, and shipped six times as many butterflies with every individual
  number defended in writing.
- Two changes that are each right can be wrong together, and nothing catches it
  when they are expressed in different units. "Fewer butterflies" and "a smaller
  neighbourhood" are both correct and their product is a density that nobody
  wrote down. Whenever a milestone moves a count and an extent in the same
  breath, the thing to state afterwards is the RATIO.
- When a system has two kinds of the same thing, tune the SUM. Every sentence of
  M54.2 reasons about the butterfly pool's 62 and the cabbage-white's 34 is never
  once added in — so the number the player was actually looking at was ninety-six
  and no note in the file mentions it. The test now counts them together, which
  is the check that would have caught it.
- At the default zoom the WHOLE ambient neighbourhood projects inside the
  viewport, so the pool size IS the on-screen count. There is no hiding place and
  no cull to hope for: the count in the table is the count in the frame.
- `size` is a scale factor, not an extent, and measuring one and reporting the
  other is how a bird came to be three times the height of the player. Ask the
  GEOMETRY how big something is — its bounding sphere times the instance's scale
  times the projection — and compare it against something in the scene the player
  knows the size of.
- A comment that asserts an outcome instead of measuring it is worth less than no
  comment. "Bigger than the rest and still small on screen, because a bird up
  here is a dozen units further away" was wrong by a factor of three, and it was
  wrong in a way that made everybody who read it stop looking. The camera is
  forty-six units out; twelve units of extra distance is a quarter of the size,
  not an order of magnitude.
- Enforce the rule a file states about itself. `ambience.ts` opens by saying
  nothing in it is "larger than a fist", which was true when it was written,
  false by the end of the same phase, and checked by nothing. A prose rule with
  no assertion behind it is a rule that documents its own violation.

- The soundscape is DERIVED from where you are, when it is and how hard it is
  blowing, and none of it is sent. Third time this argument has been made — the
  hour, the wind, now the sound — and it is the same argument: it drives nothing
  the server resolves, so a message carrying it could arrive late or drift
  between two people standing in the same field, in exchange for authority
  nobody needs.
- The beds read the SAME tables the fauna does. A wood has been a visibly
  different place to stand in since Phase 54; `forestStrengthAt`, `riverAt` and
  `nightAmount` answering for both is what stops what you hear and what you can
  see being two different places.
- Sound is SYNTHESISED, like every cue, every town texture and every building.
  A field recording of English woodland would arrive in a different stylisation
  from the chiptune blip a sword makes — Phase 49's argument about a downloaded
  building in front of Quaternius pines, one sense across — and would be
  megabytes for a bed that is four filters over one buffer of noise.
- A gust opens a FILTER, not just a fader. Level alone reads as somebody turning
  it up; the corner moving from 420Hz to 1.5kHz is what makes it weather.
  Measured, the band above 1.6kHz moves 35dB between a calm and a blow, which is
  most of what the ear is actually hearing.
- The wind and the leaves are a PAIR, not two beds. A wood is sheltered, so the
  open wind drops away as the canopy closes and comes back two octaves up —
  which makes walking into Blackstand a change rather than an addition. Same
  shape as the butterflies handing over to the fireflies at dusk.
- A cricket is a RATE, not a pitch. A square wave gating a gain at twenty-odd
  hertz sounds like one and a tremolo does not, and three voices at rates that
  are not multiples of each other drift in and out of phase for ever instead of
  pulsing together.
- Birdsong is EVENTS, not a bed, and the silence between them is the feature.
  Continuous, it is an atmosphere track; intermittent, it is one bird somewhere.
  The gaps are exponential rather than a jittered interval, because a jittered
  interval still has a beat in it.
- Where the fires are is read off the tables they are PLACED from, not from a
  registry the things that draw them fill in. A registry agrees on the day it is
  written, and this also works before the models have loaded. Braziers and
  torches are weighted by night as a FADE, so nobody keeps a second opinion
  about the hour the lamps come on; the forge burns at every hour because there
  is a smith standing at it at every hour.
- One master gain over both busses, which is why the cues moved onto the graph.
  Two subsystems with two independent volumes is a mixer with a bug in it: `M`
  would have silenced one of them. The cue bus and the ambient bus are separate
  underneath it because they are mixed against different things — a cue is an
  event the player caused and has to land, the world is a floor that must never
  be the reason a hit is not heard.
- The follow time is 0.75 seconds and it is the most important number in the
  file. A bed that tracked position tightly is a volume knob turning as you
  walk, which the ear hears as a mechanism. At three quarters of a second the
  river simply gets closer.
- Guard every ramp against not having moved. `update` runs from the render loop,
  and an AudioParam's automation list is a LIST — six events a frame for ever is
  a leak with a slow fuse. Standing still is the common case and must cost
  nothing.
- Crossfade the loop seam of a noise buffer. Four seconds looped end to end
  clicks, and a click every four seconds is a metronome nobody can find.
- Audio is verified by TAPPING THE BUS, never by listening and never by asserting
  that a node exists. Level and four bands, per place and per hour, with the beds
  driven by synthetic values rather than by walking a character around — which is
  precisely what writing the update as a pure function of a place and an hour
  buys. `__wieldboundAudio` exists for the same reason `__wieldboundLoad` does,
  and with a stronger case: an audio graph is the one part of this project with
  nothing on screen at all.
- Test the WORLD a soundscape reads, not the sound it makes, in the offline
  suite. Every failure of that half is an absence rather than a fault: a wood
  whose canopy never crosses the threshold its own birdcall branches on is a
  call that plays nowhere and throws nothing, and a river audible from the town
  square is something nobody would ever question. The thresholds are parsed out
  of the client rather than restated, because a copy stops agreeing at exactly
  the moment the test would have to fail.

- The ground lift is PER STATE and per CLIP — never one constant, and never per
  frame. One constant is the worst clip's, paid in every other clip: `Walk`'s
  38mm left an idle character hovering permanently, and an attack and a stagger
  were never measured at all. Per frame is the opposite mistake and a subtler
  one: forcing the lowest vertex onto the ground at every instant deletes the
  flight phase of the run. The rule is that nothing may go BELOW the ground, not
  that something must always touch it.
- A crossfaded seat is the mixer's own weights applied to the per-state lifts,
  never a second easing beside the first. Two blends of the same thing drift,
  and the drift here is a foot skimming the grass for a fifth of a second every
  time somebody sets off.
- Under-sampling a minimum has TWO axes and fixing one says nothing about the
  other. M55.3 fixed the vertex stride and left the time axis at twenty-one
  points, which under-reported `Walk` by five millimetres — and only `Walk`,
  because it is the one clip whose sole passes through its lowest point quickly.
  Converge the scan and then find a cheaper way to reach the same number, rather
  than picking a sampling rate that looks generous.
- A cast shadow and a contact shadow are different things and neither substitutes
  for the other. One says where the LIGHT is and walks away from the feet at
  every hour but noon; the other is the ambient a body keeps off the ground it is
  sitting on and never moves. There has been a real sun casting a real shadow
  since Phase 47, and characters still did not look like they were standing on
  anything.
- Shade MULTIPLIES; light ADDS. A dark quad blended normally is a grey decal
  lying on the grass and looks like one at every opacity — the surface underneath
  has to survive, darker. It is the exact mirror of the argument that made the
  pool of light additive.
- A multiply needs no help from the clock, and giving it some charges twice. The
  first version scaled the shade by the hemisphere fill's intensity as well, and
  at midnight it came out at a peak channel delta of zero — not weaker, absent.
  A fraction of whatever is on the ground already does the whole job.
- A flat mark on ground that is not flat is a CHORD, and most of it is inside the
  hill. Measured for a quad 1.32 units across: the drawn ground rises above a
  level quad by a median of 86mm and above one TILTED to the local slope by 3mm.
  Four height samples and no shader. This is M55.3's own lesson one level down,
  which is now three times this project has had the argument about a thing and
  the ground it sits on being one answer.
- Emberhold's paving is a TRANSPARENT decal that writes no depth, so anything
  meant to lie on the ground has to be ordered against it explicitly. The shade
  measured a clean 1% of its box on grass and exactly nothing on cobbles, from
  the same code in the same frame. The stack is: town surfacing 1–3, contact
  shade 4, pool of light 5 (light falls on shaded ground), mist 6 (air in front
  of all of them). The pool of light had been sharing order 2 with the paving
  since Phase 54.
- Stop the game loop before differencing two frames. A running world differs
  frame to frame by the wind, the mist, the flames and the butterflies, and a
  difference across that is a picture of the weather. Reported as 9.6% of the
  frame changed by a patch a metre across.
- The camera's distance is a stored PREFERENCE, so a probe that does not pin it
  is framing the scene however the last person to spin a wheel left it. Pin the
  zoom, and — the check that actually catches it — PROJECT the subject and refuse
  to measure until it is confirmed in frame. Without that, a probe reports a
  perfectly clean measurement of somebody else's feet.
- Measure a multiply as a RATIO, never as an absolute channel delta. Delta
  under-reports on dark ground by exactly as much as the ground is dark, which is
  the same shape of mistake as the magenta threshold that could not see a
  35%-alpha mote. As a fraction of what was there, the mark takes the ground to
  52% at noon.

- The feet stand on the ground AS DRAWN, not on the field it was sampled from.
  A terrain mesh joins its samples with flat triangles, and a chord rides above
  the curve it spans across a hollow — measured at up to 0.14 units over 24% of
  the world. Same shape as M54.1a: the thing you stand on and the thing you see
  have to be one answer.
- A model is seated in the bind pose and stands in a clip. The lift is measured
  over the clips where the character is UPRIGHT and no others — including Roll
  or Death would raise the rig in every state to fix the one state that was
  already right, because a body on the ground belongs on the ground.
- When sampling to find a minimum, coarse sampling UNDER-reports, and under-
  reporting a ground clearance leaves the foot in the floor. Every ninth vertex
  found 0.029 where every third found 0.038.
- Drive a probe camera from the TARGET position, never from the actor's current
  one. After a teleport the actor is still interpolating, and at the ~1fps rAF
  headless gives you it is in transit for many frames — so `follow(actor.position)`
  chases a point that has not arrived and the crop misses the character.

- Identity comes from the NAME, not from a character creator. A name is already
  unique, already persistent, and already on every client that can see you, so a
  tint derived from it needs no column, no wire field and no creation screen —
  and unlike a random seed it is something the player chose.
- A harvested part and a generated part live in DIFFERENT SPACES. Generated
  gear is authored in the model's rest frame and needs the bone undone;
  harvested gear was already a child of its bone and must not have it undone
  twice. The piece says which it is in, because the symptom of getting it wrong
  is a pauldron a metre off the shoulder, which reads as a bad asset rather than
  as a coordinate bug.
- Trust an asset pack's NAMES for nothing. Ranger.fbx calls a hood a `Cloak`
  and parents it to `Head`. Attaching every harvested piece to the body one at a
  time and photographing it is one probe and it settles all ten placements.
- A tint knob has to be sized against what it MULTIPLIES. Too narrow and every
  character is the same beige; too wide and every character clips to the same
  near-white. Both were reached in this milestone, from opposite directions, and
  they look identical from the outside.
- Verify a distribution over THIRTY samples, not four. The four names in the
  browser probe hashed to 0.60, 0.75, 0.60 and 0.66 and would have condemned a
  spread that is near-uniform from 0.49 to 1.02.

- ONE body, for everybody, forever. The per-class rig was never a design
  decision — it was the kit welding each character to its own animations, so the
  only sword swing in the project lived inside the Warrior. Pooling all five
  files onto the shared 44-bone skeleton unwelds them. What you hold still
  decides your class, your bar, your reach, your mana, your damage attribute and
  now your SWING; it does not decide who is holding it.
- Verify a skeleton claim by MEASURING bone names, never by looking at two rigs
  and deciding they match. The Wizard reports 76 bones against the others’ 44
  and would have read as a refutation from across the room; the extra 32 are
  robe bones no clip touches.
- A borrowed clip is verified MID-MOTION, at a fixed fraction of its own
  duration, by measuring the bone bounding box. A bind-pose mismatch renders a
  character bent, stretched or inside out, and none of that is visible at rest —
  which is the only pose a naive screenshot ever catches.

- An OUTLINE is what both visibility problems were asking for. "Highlight the
  player" and "stop showing me a skeleton through walls" arrived as two reports
  and are one shape: the contour of a figure and nothing inside it. Unoccluded
  it is an expanded hull, occluded it is a fresnel, and the reason they are
  different instruments is that a fresnel lights every edge-on surface — which on
  a low-poly rig is a stipple over the armour, not an outline.
- The outline draws AFTER the body. Before it, each mesh is erased only by
  itself and every overhang between the parts of a rig keeps its own line;
  after, the whole figure has written depth and only the true silhouette
  survives. Same geometry, different question.
- A flame's colour ramps on HEIGHT, not on heat. Fire is white at the wick and
  red at the tip, which is a gradient up it rather than in from its edge — and
  on an additive surface the cool end of a ramp is a different HUE at full
  strength rather than a dim version of the hot end, so ramping on heat painted
  a solid maroon triangle across the bottom of every fire.
- Mist is not symmetric about noon. It forms overnight and burns off in the
  first hours of sun, so it peaks at dawn and returns weakly at dusk. A curve
  symmetric about noon would be the same shape as the light and would say
  nothing the light was not already saying.
- The size of a pooled neighbourhood is set by what the CAMERA can resolve, not
  by where the fog ends. A 74-unit disc is seventeen thousand square units and
  the visible wedge is about sixteen hundred, so 76 butterflies put three on
  screen. Count the instances that PROJECT INSIDE THE VIEWPORT; existing, being
  drawn, and being looked at are three different questions.
- A small flying thing is sold by DISAPPEARING, not by being visible. The flap
  closes to 8% of the wingspan, so most of the beat is edge-on and the eye gets
  an intermittent flicker. A wing that never shrinks past a third is
  continuously present, and continuously present at fifteen pixels is paper.
- Never tune a pooled system before confirming the pool is FULL. The mist's
  density was judged against a disc most of whose sheets were stranded at an
  invisible rim after a teleport; fixing that doubled the measured thickness
  with no change to a single number. A pool that respawns at the edge needs a
  wholesale-move case, because "one thing left" and "everything left" are
  different events wearing the same test.
- The outline and the pool of light run in OPPOSITE directions with the hour.
  An edge is read against the background, so it needs weight in daylight and
  almost none at midnight; a pool of light on the ground is the reverse. Two
  mechanisms, one legible figure, neither ever the loudest thing on screen.
- Verify a faint additive effect by DIFFERENCING the frame with the mesh shown
  and hidden, never by counting pixels above a colour threshold. Both the
  ambience and the mist were declared broken by a magenta counter that wanted
  R>150 when a 35%-alpha magenta lands at 89. Two of the five measurement rounds
  in M54.2 were spent debugging the ruler.

- ONE surface height, taken by everything that stands on the ground. The
  crossing was three opinions about where the road is — the terrain said
  riverbed, the ribbon said deck, the player’s feet said terrain — and the
  result was walking through your own bridge. Anything that can disagree about
  where the ground is eventually will.
- A ramp belongs in the HEIGHT FIELD, not in boxes laid on top of it. Boxes meet
  the land wherever they happen to, and nothing else sampling the ground knows
  they exist. Putting the approach in the height function makes the join impossible
  to get wrong rather than merely fixed.
- Anything shaped by the terrain mesh has to be several QUADS long to read. The
  mesh is 1.63 units a quad, so the first 5.5-unit ramp was described by three
  vertices and came out as a step. Same family as the amplitudes that were too
  timid for a 41-degree camera: a feature smaller than its own sampling is not a
  subtle feature, it is an absent one.
- A bridge deck sits ABOVE the bank crest, never below it. At 1.9 units over the
  water and a crest at 2.4, the road had to dip into a hollow to get onto the
  bridge.
- The clear span between the rails is WIDER than the road, because the bridge
  frame is a straight line and the road is not. Over eight hundred pixels of
  span the road bends nine pixels past its own half width, which put the outside
  rut through the parapet. Measured off the real curve by the test rather than
  assumed.
- The wind is DERIVED from wall-clock time, like the hour, and for the same
  reasons: it drives motion and nothing the server resolves, so a message
  carrying it could arrive late or drift between two people in the same field.
  Its periods are deliberately incommensurate with the 24-minute day, or the
  same gust would arrive at the same hour forever and it would read as a loop.
- The wind's strength floor is 0.34, not zero. Dead calm reads as the animation
  having broken — which is worse than no animation, because the player has just
  watched it work. Air is never actually still outdoors.
- Sway is weighted by height above the instance's own root, squared, and
  phase-seeded from WORLD POSITION. The first turns a slide into a bend; the
  second turns a field being shaken into a wave crossing it. Both are the whole
  difference between “there is wind” and “something is wrong with the grass”.
- A shader uniform is a float32, and anything derived from `Date.now()` will not
  fit in one. At 2.9 billion the spacing is 256, so a phase built that way does
  not move for minutes and then jumps. Bounded values only — and when a bounded
  value has to wrap, make the wrap EXACT rather than small: pick the wrap so
  every frequency downstream advances a whole number of turns.
- One seeded generator, in `shared/`, and never a copy. The six copies of the
  textbook C LCG were all broken in the same way — `s * 1103515245` overflows a
  double before the mask, so the sequence had 11,064 distinct values — and the
  symptom was not “the random numbers repeat” but “the world looks empty” while
  every counter said it was full. `Math.imul` is the only multiply in the
  language that keeps the low 32 bits.
- Assert the property that FAILED, not the property that is easy to write. The
  broken generator passed determinism, speed and uniformity; what it failed was
  PERIOD, and — for a scatter that draws positions two at a time — pair coverage
  over a grid. A generator can have a long period and still walk a lattice.
- Before bisecting a renderer, confirm the bytes it is running are the bytes you
  wrote. Two rounds of “the source is right and the runtime disagrees” were a
  long-lived Vite dev server serving stale modules. Same family as the six
  textures it served as `index.html` in M53.3, and the browser pass now restarts
  it first.
- Motion is verified by DIFFERENCING FRAMES, not by looking at one. A pinned
  camera, a frozen hour, three screenshots and an amplified difference image is
  a picture of exactly what moved — and it was the difference image that showed
  the trees were not moving at all while the grass was.

- The woodcutter's tree is the ROUND-CROWNED BROADLEAF and nothing else in the
  world may wear it. "Nothing scattered may resemble a resource node" kept every
  tree outside the play bounds for six phases and made a forest illegal; rather
  than break it, the vocabulary was split. Two disjoint model sets, a scale gap
  (node 3.4–4.6 units, forest tree from 6), and the node's nameplate pill —
  three separating channels, none of them colour. Asserted against both real
  source files, because it is a rule about two arrays that nothing in the engine
  keeps apart and whose failure is a player quietly learning to click scenery.
- Forests live PAST the last monster camp, and that is a gameplay call rather
  than a placement convenience. The five bands are where the game is played —
  telegraphs to step out of, camps to size up from a distance, nodes to spot —
  and trunks cost all three. Emberhold's district is open ground; the land takes
  over past it. It also makes "no wood swallows a camp or stands on a node" true
  by construction instead of by fifty measurements.
- The river is authored in ABSOLUTE world pixels, not polar. The road is the
  first object here that does not radiate from spawn and its waypoints are still
  polar, because that is how the route was checked against the camps. A river
  has nothing to do with the camps: it is a feature of the land, so it has a
  coordinate. Polar is the language of "distance from spawn IS difficulty", and
  the moment something is not about difficulty it should stop speaking it.
- The river is SOLID, and it is the only solid thing outside the palisade. Phase
  52 wrote down that nothing out here is solid — a second collision system for
  four props in a field is a mechanism to keep honest forever in exchange for
  nothing. The river is the opposite trade: one shape, and it is the reason the
  bridge exists. "The road is the safe way through" gains "and the bridge is the
  only way across", which is the first thing that makes staying ON the road
  worth something to a player who could win the fight.
- The bridge's position is DERIVED from the intersection of the two curves, and
  the test pins that they cross exactly once. A typed coordinate agrees on the
  day it is written; a road that forded the same river twice would need two
  bridges and would have one.
- A river's surface height is the land along its own course, low-passed and then
  forced MONOTONE from the source down. Constant height is a canal on stilts at
  one end; following the land makes it flow both ways at once. And the banks are
  RAISED to a crest rather than levelled to a target, because levelling lets the
  water flood sideways wherever the land sits below it.
- The bridge deck and the road's ramp onto it are measured from the WATER, never
  from the ground plus a constant. A constant puts one end of a bridge in the
  river on any bank that is not level with the other, which is every bank.
- Forest canopy and riverbank wetness are BAKED onto the terrain mesh as vertex
  attributes rather than evaluated in the shader. The other ground fields are
  noise of world position, which is cheapest where it is used; these two are a
  table of six discs and a two-hundred-point polyline, which are not things to
  re-derive per fragment. Two floats a vertex, computed once, interpolated free —
  and the mesh's metre-and-a-half quads are finer than either feature's edge.
- Relief is only visible when the LIGHT changes across it, so verification hours
  are noon AND a low sun. Three rounds of noon screenshots said the river's
  channel had not been cut; the geometry was right the whole time and a
  mid-afternoon shot showed it plainly. At noon a twenty-degree slope catches
  within five per cent of what flat ground does.
- `placeNameAt` returns NULL over most of the map on purpose. Naming every
  square — "the Eastern Reaches" — would make the fourteen places that are
  genuinely places worth nothing. The readout going blank is what makes it mean
  something when it comes back, and the test fails if more than forty-five per
  cent of the world has a name.
- The camera's pitch stays fixed, and the answer to "the hills never silhouette"
  is not the camera. A silhouette comes from what stands ON a ridge, not from
  the ridge: a treeline running over a rise reads as a rise. If more is wanted,
  the lever is relief and trees OUTSIDE the play bounds, where nothing is fought
  and amplitude is free. Flattening toward top-down would change what a telegraph
  circle and a body's footprint look like, which the player reads positionally.
- When a browser pass looks wrong, suspect the harness before the renderer. Two
  runs of "the character is missing and the camera is eighty units behind" were
  headless Chromium throttling requestAnimationFrame to about a frame a second:
  a screenshot forces a render, it does not force the easing to have run. Same
  family as the six textures Vite served as `index.html`.

- Emberhold's buildings are GENERATED rather than downloaded. The kits this
  project uses have props, plants and characters and no buildings, and a
  building pack in a different stylisation standing in front of Quaternius
  pines is the exact mistake the treeline was already fixed for. Boxes and
  prisms in the game's own palette cost a file and match by construction.
- Town textures are drawn NEAR WHITE and multiply the palette rather than
  carrying colour. One place decides what colour plaster is; a texture is only
  ever a pattern of light and shade over it. They are also `NoColorSpace`, not
  sRGB — decoding a shading mask as sRGB darkens every surface in town by about
  a stop and the palette stops meaning what it says.
- UVs for the town are box-projected from WORLD position, per triangle, on the
  merged geometry. Primitive UVs are 0..1 per face regardless of the face's
  size, so one shared map is four metres a tile on a wall and eight centimetres
  on a window frame. Per triangle rather than per vertex: choosing the axis per
  vertex tears every triangle that spans a corner.
- The town's night lighting is two mechanisms, not one. Lanterns and lit
  windows are places and come on by the hour alone — a town that only lights up
  once you are inside it is a town with nothing to walk toward. The ambient
  fill is a concession to legibility and is scaled by the PLAYER's distance from
  the centre, so nobody carries the town's light out into the field with them.
- No currency. Oswyn is priced in materials, which is what every other system in
  the game is already priced in; adding coin would put a second, competing
  denomination beside every number in the smithy. He sells only band 1–2 and
  everything he stocks costs more in total than forging it, so he is a floor
  under a bad start rather than a way round the anvil.
- Quest progress is stored, not recomputed from statistics. Kills you made
  BEFORE taking a quest do not count toward it — which is what a player expects
  from "go and kill four slimes", and the alternative hands you a finished quest
  the moment you accept it.
- Quest kill credit uses the XP rule (everyone who damaged it), not the loot
  rule (top contributor). Loot is indivisible and quest progress is not, and a
  shared quest that only advanced for the killing blow would make questing
  together worse than questing alone — the same defect Phase 42 fixed for
  experience.
- Nothing gatherable stands inside the walls. A node between the anvil and the
  inn quietly makes the square another field, and a town is somewhere you go
  between gathering trips.
- One road through the town, not four spokes. Four gates cut the building ring
  into four 66-degree arcs and six buildings do not fit in them without their
  front corners overlapping. Two gates give two 156-degree arcs with room to
  spare, and a village on a road is the more legible shape anyway.
- The square is sized to the PEOPLE standing in it, not to its architecture.
  The first build was measured against how much room the buildings needed and
  was too tight the moment anybody stood in it. `SMITHY_CLEARANCE_PX` in the
  layout test is deliberately far larger than any building requires.
- Scenery counts are densities, not headcounts. The treeline and the ground
  cover scale with the play area, so the next time the world is resized it does
  not silently thin out — which is what happened to both when it grew by half.

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

- Floating combat text is anchored to a body, not to a point on the screen. It
  was projected once at spawn and then animated in CSS, which is correct in a 2D
  game where the camera is the screen and wrong the moment the camera can move —
  two steps sideways and the numbers are hanging over empty grass. The cost is a
  per-frame re-projection for a couple of dozen elements, which is nothing; the
  benefit is that a number keeps belonging to the thing it describes.
- A damage number's SIZE is its share of the victim's health, not its absolute
  value. Ten damage is a third of a slime and a rounding error on a dragon, and
  drawing both the same is throwing away the only thing the number is for. The
  curve is a square root deliberately: the difference between 2% and 12% of a
  health bar is worth showing and the difference between 60% and 70% is not.
- Combat text is coloured by DIRECTION, not by damage school. A palette per
  school is the obvious reading and it answers a question nobody is asking —
  mid-fight the only question is "am I winning", so warm white is your weapon,
  blue is your spells and red is what is being done to you. Crits are gold in
  both directions, because a crit is an event before it is a number.
- Text about the player always drifts left, everything else fans both ways. The
  player is at the centre of the screen and whatever is hitting them is a metre
  from them, so two anchors that close produce two columns of numbers in the same
  place. A lane of its own separates "what you are taking" by position as well as
  by colour, and that is the reading that must never be searched for.
- A volley is staggered in time as well as spread in space. Five numbers arriving
  on one frame is a single event however far apart they are placed; 55ms between
  them turns a cleave into a sweep, which is what the skill actually is. Capped
  at six steps, or a chain into a crowded pack would still be introducing numbers
  a second and a half after the blow landed.
- Most of the fan offset is applied immediately and only the rest drifts in.
  Easing the whole thing from zero starts a volley stacked on one point, and that
  first frame is exactly when a cleave into a pack most needs to be readable.
- The loading bar's total is produced by the loader and is allowed to grow. A
  hardcoded "47 models" goes stale the first time a model is added and cannot
  know about the textures each model drags in behind it, so the counters live
  where the fetches are — and dressing an FBX discovers more work, which means
  the denominator moves. The honesty is kept in the data and the monotonicity is
  applied in the view: the bar slows down, it never retreats.
- Waiting for models is not waiting for the load. A model's promise resolves when
  it has parsed; the textures it needs are requested during dressing and are
  awaited by nothing, so a scene can finish "loading" and then visibly repaint
  itself twenty megabytes at a time. `whenLoadsSettle` is what lets the screen
  come down on a frame that is actually finished.
- Start-up's three halves are independent, so they run at once — and the socket
  goes first. Decor, the character rig and the connection had been a queue, which
  is the same mistake the smithy's six props made inside one loop in M4.5, one
  level up. Connecting first is the part that shows: the handshake and the first
  snapshot travel while the models download, so the world is populated the
  instant there is somewhere to draw it, rather than arriving a beat after the
  ground does.
- The loading screen names a phase, not a file. `nature/Pebble_Square_2.gltf` is
  the honest string and the wrong one to show somebody who pressed Play; "raising
  the treeline" is what they want to know. The exact name stays on
  `__wieldboundLoad`, which is what a stuck load actually needs, and that split —
  one string for the player, one for the console — is the same one `shared/`
  already keeps between naming a picture and drawing it.
- Idle animation phase is seeded from the server id, not randomised. A camp is
  four copies of one model playing one clip started at one moment, and the result
  reads as an animation applied four times rather than as four creatures. Seeding
  rather than randomising is what keeps two players standing side by side from
  watching the same camp breathe in different orders — a small thing, and exactly
  the kind of small thing that makes a world feel like a local hallucination.
- The phase is applied on every entry into idle, not once at load. An actor
  returns to idle constantly — after every swing, every stagger, every stop — so
  a phase set at load is lost the first time anything moves. Run is rate-varied
  but deliberately NOT phase-offset: a pack chasing you is supposed to move
  together.
- Idle creatures look around by turning, not by playing a second clip. Nothing
  in the game writes an actor's facing while it is standing still, so an
  undisturbed camp held its spawn heading forever. A head-turn works on every
  model whatever clips its pack happened to ship with, and it is the most legible
  thing an idle creature can do. It needs its own slower turn rate — the 14 rad/s
  combat uses makes an idle monster snap round like a turret.
- Only monsters glance. A player's facing is not decoration: a skill fired with
  nothing in range uses it to decide which way the effect goes, so a character
  that turned on its own while its owner was reading a panel would aim somewhere
  they did not choose. Nothing reads a monster's facing except the eye.
- Do not measure something that expires across a `page.evaluate` boundary. A
  float lives 1150ms and a round trip plus two frames under SwiftShader can take
  longer than that, so a test that spawns in one call and reads in the next is
  measuring the reaper. Spawn and read in one evaluate, and wait for the elements
  to be PLACED rather than for a fixed time.
- Polling the page during a heavy load returns only its final state. The main
  thread is saturated parsing models, so every `page.evaluate` queues behind that
  and all of them resolve at the end — twenty samples of the loading bar all read
  100%. The trace has to be recorded inside the page, which is what the
  `__wieldboundLoad` handle is for.
- Tests that share a world with a live game must assert on identity, not on
  counts. Something is usually hitting the character, so a stray real damage
  number lands in the middle of a probe and "six elements" becomes seven.
  Capturing the specific nodes the probe created removes the race — and it has to
  deduplicate, because retired floats are pooled and the same node comes back.

- An item is a BASE plus what happened to it. The old model — a slot and a
  rarity, with two numbers rolled off a table keyed by the slot — is fine while
  items are anonymous and stops being fine the moment they are drawn in 3D and
  the premise of the game is that what you hold is who you are. The catalogue is
  the centre of gravity now: adding an item is a row, and everything downstream
  (loot, the forge, the bag, the tooltip, the body) reads it.
- Mesh, palette and rarity are three independent axes. Mesh says what shape it
  is, palette what it is made of, rarity only tints and multiplies. That is the
  paperdoll's own argument one level up, and it is what turns twenty-three
  downloaded models into a seventy-eight item catalogue — the same greatsword
  mesh is Steel, Frost and Dread and none of them needed an artist. Baking any
  two together puts us back where the 2D game was, needing styles x rarities of
  everything.
- Item numbers are derived from band and slot, not authored per item. A hundred
  and fifty hand-typed values across seventy-eight items is a hundred and fifty
  values that drift, and no reviewer can tell by reading them whether band 3 is
  stronger than band 2. A base declares its band and, where it is genuinely
  unusual, a multiplier.
- The seven qualities are CONDITIONS, not colours. common/rare/epic was borrowed
  from every other game and said nothing about this one, whose one fixed
  landmark is a forge and whose crafting verbs are forge, reforge and salvage.
  Broken through Enchanted says the same thing the smithy does.
- Broken multiplies DOWN. A bottom tier that is merely "the worst you can find"
  is a synonym for common; one that is actively worse than baseline is a real
  state with a real answer — salvage it, or spend to pull it up the ladder. And
  it gives the low end of the game something to hand you that is not nothing.
- Honed sits at exactly 1.0 so the catalogue is authored at true values. A
  designer reading `ITEM_BASES` should be reading the numbers an item actually
  has, not numbers that only mean something after a multiplier.
- Affixes speak `PassiveBonus`, the vocabulary the talent trees already total.
  This is not tidiness: combat resolution already reads `passives.critChance`,
  the character sheet already displays it, and `applyDamagePercent` already
  knows what to do with a percentage. A separate affix vocabulary would have
  meant teaching every one of those about a second source — which is exactly how
  helm and cape once came to roll stats nothing ever read.
- Gear passives are added inside `passivesOf`, the one funnel every combat
  number already flows through. One edit reaches damage, accuracy, armour, mana
  and cooldowns, and the character sheet reads the same totals the server
  resolves with.
- The forge decides WHAT and the ladder decides HOW GOOD. Letting the forge pick
  a quality is what made the old workbench a way of buying loot rolls, and it
  would make reforging pointless. Forging always outputs Honed.
- Reforging RE-ROLLS rather than adds. Keeping the old affixes and appending
  makes a reforged item strictly a superset of itself, which turns "which item
  do I invest in" into "whichever I found first" — and would mean an Enchanted
  item's three affixes were chosen by what a Worn one rolled six steps earlier.
- Essence comes off kills and cannot be gathered. Without one material the world
  will not hand you for standing still, the top of the reforge ladder is a
  function of time spent at trees, and the strongest gear in the game belongs to
  whoever fought least.
- The forge is gated by CHARACTER level, not weapon level. Weapon level is a
  commitment to one family, and gating the bench behind it would punish exactly
  the weapon-swapping the game is named for.
- The two-handed rule lives in `db.equipItem`, not in the message handler. It is
  a property of what is worn, so every path that equips something — a starting
  kit, a reward, a test, a future one nobody has written — obeys it without
  being told.
- Styles are declared by the base item, not rolled. Rolling a look was right
  while items were anonymous slot-and-rarity pairs and is wrong the moment they
  have names: "Ranger's Hood" is a hood because that is what it is, not because
  a random number came up hood.
- The grip is harvested and every model is fitted into it. Character rigs ship
  their weapon already parented to `WeaponR` with the right transform, and that
  is the one thing that must not be guessed — a grip tuned by eye is wrong on
  the next animation and wrong again on the next body. Fitting twenty-three
  downloaded models into the donor's geometry space generalises what `buildAxe`
  and `buildMace` already did for two procedural ones, and means adding a weapon
  needs no grip constant at all.
- Measure which axis a model lies along; do not assume it. The first fitter
  rotated everything a quarter turn because the pack authors standing up in Y —
  true of the files, false of what arrives, since FBXLoader has already
  converted to Z-up. It measured the blade's width and every weapon came out
  twelve times too big.
- Scale by the LARGEST extent even when orientation uses a different axis. These
  are two separate questions and conflating them is a real bug: normalising a
  shield's sixty-unit thickness to a sword's length blew it up to five times the
  character. Same rule the ground scatter arrived at when a flower clump
  normalised by height came out a metre across.
- One rarity palette, in `shared`. It existed FOUR times before the catalogue —
  the bag, the character window, the workbench and the tooltip each carried
  their own hex table, and the 3D tinting a fifth. A value duplicated per call
  site is a value that drifts, and nobody notices until two panels disagree
  about what colour a tier is.
- Every number a weapon contributes resolves in ONE function. The family
  multipliers had been read inline at six call sites, and adding per-item tuning
  to each would have been six edits nobody was reminded about — the same shape
  as the bug that left helm and cape rolling stats no formula read. `reachOf`,
  `swingIntervalOf` and `hitBandOf` are the only places that know how a weapon
  turns into a number, which is what stops the character sheet quoting something
  the fight does not use.
- A tooltip compares per NUMBER, never as one verdict. "Better" is not a fact
  when an item trades damage for speed, and a green arrow claiming otherwise
  makes the decision for a player who might reasonably disagree with it.
- What a weapon's description says is read off the multipliers combat resolves
  with, not written by hand. Hand-written flavour about how something swings is
  a second copy of a number, and it goes stale the first time anything is
  rebalanced.
- Loot lands on the GROUND. A kill is the one moment an item system has the
  player's whole attention, and spending it on a line of text wasted the only
  art the item has — the model went unseen until the bag was opened. It also
  gives a full bag an honest answer: the drop waits rather than being destroyed.
- A drop is picked up by walking over it, because everything else in this game
  is decided by where you are standing. Gathering, combat and the workbench are
  all proximity; a pick-up key would have been the only exception, and an
  exception is a thing players have to be taught.
- A drop is reserved for whoever the threat table credited, then goes free. The
  table already decided who earned the kill — it is the same fact the experience
  split reads — and letting the reservation lapse is what stops a drop nobody
  wanted becoming litter only one person can clear.
- The drop's model is `buildHeldItem`, unchanged. The claymore on the grass is
  the same object you will be holding a second later, and `drops.ts` knows
  nothing about how a weapon is built. Anything with no model — rings, armour —
  gets a pouch rather than a second art path invented for it.
- A new prop is refused if it would need a fourth trim atlas. The whole kit
  shares three, every model already in the repo uses those three, and that is
  the entire reason adding a prop is free. `tools/art/props.mjs` checks it rather
  than trusting it.
- The corner toast is for the top two qualities only. A line for every Worn
  dagger is noise, and noise is what makes a player stop reading the corner at
  all — the same argument that gives only bosses a framed nameplate.
- A patch script that aborts a batch must say the whole batch was dropped. Three
  edits went missing here because one mismatched and the failure message named
  only that one, so two unrelated changes silently never happened and were found
  by a test much later.
- Do not edit client files while a browser suite is running. Vite reloads the
  page under it and the run dies with "execution context was destroyed", which
  reads like a product fault and is not one.

- Palette had to mean something or it should not have been an axis. Mesh decided
  the shape and quality decided the numbers; the third axis was the only one a
  player could SEE and the only one with no reason to care about. Matched gear
  hangs off palette rather than a hidden set id precisely because of that
  visibility — you can tell across a field whether someone is wearing a kit.
- A set bonus is a tiebreaker with a look, never a second progression. A full
  matched kit is worth less than one step up the quality ladder, and the test
  asserts the ceiling rather than trusting the tuning — the moment a set beats
  numbers, the palette axis stops being a choice and becomes the whole game.
- A set nobody can assemble is content that does not exist. The first run of the
  matched-gear test refused eight of twelve sets because the catalogue only had
  those materials in two or three slots, which is exactly the silent failure
  worth catching: nothing throws, the bonus simply never fires. The fix was 29
  more base items, not weaker thresholds.
- The floor of a system has to leave room for the system to move. Band 1's
  budget was 3, which multiplied down to a primary of 1 on the lightest slots —
  and a stat of 1 cannot get worse, so Broken and Honed were identical on those
  items and the bottom of the ladder did nothing for them. Raised to 4.
- One vocabulary for what a modifier does. Affixes and set bonuses both grant
  `PassiveBonus`, and both now render through `passiveSummary`, so two sources
  that give armour say "armour" the same way in the same order everywhere.

- A recipe is learned by taking one apart, not by reaching a level. Level-gating
  made the forge a shop — a list of things you have never seen unlocking itself
  on a schedule — and left the three smithy verbs as three unrelated buttons.
  Learning by salvage closes the loop instead: exploration feeds salvage,
  salvage feeds the forge, the forge feeds the ladder. It also gives a duplicate
  an answer better than "delete it", which is the question every item system has
  to answer eventually.
- Locked recipes are shown, not hidden. The system has exactly one rule and a
  player who never sees a locked row never learns it — and the full list is the
  closest thing the game has to a catalogue of its own items, which is worth
  having for its own sake.
- Materials stay the real cost, so learning something far above your level is
  allowed. A level-1 smith who salvages a band-5 sword has learned something
  they cannot afford for a long time, and that is a much more interesting
  position to be in than a greyed-out list.

- What a monster is made of decides what it is carrying. Rolling loot from the
  band alone made the catalogue a table the world drew from rather than things
  the world was made of — a dragon could hand you a plank shield. Affinity is a
  bias and never a restriction, because a camp that only drops one palette is a
  vending machine, and the matched sets would then only be assemblable by
  farming one spot.
- Only bosses have a signature drop, and it is weighted rather than guaranteed.
  "The thing it is known for" stops meaning anything if everything has one, and
  a certainty turns the fight into a shopping trip. The rule is checked against
  `guaranteedDrop`, the flag that already decides which monsters are bosses,
  rather than against a second list that could drift.
- Assert the KNOB, not a symptom of it. The loot-affinity test failed twice for
  opposite reasons — "more often than not" is impossible for a palette that is a
  tenth of its band, and "far more than chance" is impossible for one that is
  already two thirds of it — because both put a fixed threshold on a share whose
  ceiling depends on how common the palette happens to be. The odds ratio
  against an unbiased roll is scale-free and is precisely what the weight sets,
  so it holds for all thirteen kinds without any of them being chosen to satisfy
  it.

- The reforge ladder is a gamble that becomes a decision. Every step below Runed
  re-rolls; the top two let the player name one affix. All gamble is a slot
  machine and all choice is a shopping list — the interesting shape is one and
  then the other, and it is also what makes the ladder's own names mean
  something, since a Runed item is one somebody cut the marks into on purpose.
- A choice is never a way past a rule. The rune the player names has to be one
  the item could have rolled anyway, and naming one does not add a slot. The
  check lives where the roll happens rather than at the message handler, so the
  forge, the loot table and the bench obey it by construction rather than by
  three separate remembering.

- The ground obeys the same rule the rest of the world does: further out is
  richer. Nodes paid exactly one wherever they stood, which made the ground the
  only part of the game where walking further was not the progression — and it
  used the monsters' own ring radii so a player learns one geography rather than
  two.
- An economy needs a test that it is reachable at all. The catalogue's forge
  costs grew to 327 materials while gathering still paid one per node, and
  nothing in the suite would have noticed: every individual number was
  defensible and the ratio between them was not. The check is now the ratio.
- The gather upgrade scales WITH the band rather than beside it, or it is worth
  most in exactly the place it is easiest to use — which would make the safest
  ground the best ground and undo the point of the rings.

- Consumables are a table, but they are still counters rather than instances.
  There is nothing to equip, nothing to roll and nothing to compare — a potion is
  a quantity, and giving it an id, a quality and two stat rolls to match the
  catalogue would be ceremony rather than consistency. What they needed was a
  row, not an ItemInstance.
- One pair of messages for a whole table. Four bespoke pairs meant adding a
  consumable meant adding a message, a handler, a column and a UI branch — which
  is why there were two of them for a year.
- Every consumable effect had to be something the game already did. That is what
  kept the work bounded: a consumable needing a new mechanic is a new mechanic
  wearing a potion bottle, and it would have arrived with none of a mechanic's
  usual scrutiny.
- The healing cooldown is a GROUP, not a potion. It gated by name, so the second
  healing item would have walked straight past it — "add a consumable" would
  quietly have become a way around the rule that stops a stocked player being
  unkillable.

- Etching REPLACES an affix and never adds one. Quality decides how many affixes
  an item has, and a verb that added slots would quietly make the ladder
  optional — a Broken sword with three runes in it is a Broken sword that is
  better than a Runed one. Replacing keeps the two systems answering different
  questions: the ladder decides how many, etching decides which.
- A rune is a counter, not an instance. Same call consumables made and for the
  same reason — nothing to roll, nothing to compare. It also means what a rune
  is worth is decided by the band of whatever it lands on rather than by where
  it was drawn from, which is `affixBonus`'s existing behaviour rather than a
  new rule.
- An etched affix is INDISTINGUISHABLE from a rolled one. Tracking which were
  cut in would make two copies of the same affix behave differently for a reason
  the player can see nowhere, and reforging would then have to explain itself
  twice. The cost is that reforging still re-rolls etched affixes away — which
  is stated in the Etch tab rather than engineered around, because the rule
  "reforging re-rolls" is older and more load-bearing than this feature.
- Drawing gives no materials and teaches no recipe. Otherwise it is salvage with
  a bonus, and a good drop stops being a decision. Three outcomes that exclude
  each other — wear it, take it apart, take its rune out — is what makes the
  moment worth anything.
- An irreversible choice states its restriction BEFORE it is made. A rune can
  come out of a band-4 item unusable on everything you own, and finding that out
  at the etching bench is finding it out too late, so the draw picker says what
  each rune fits.
- `||` and not `??` for a fallback off a `<select>`. An empty string is a real
  state — it is what a stale option list leaves behind — and `??` treats it as a
  choice, which here sent the server an affix nothing carried. The server
  refused correctly and silently, which left a button that did nothing: every
  refusal that is a "should not happen" from the client's side is exactly the
  kind that must say so out loud.

- "Where does this come from" is DERIVED from the loot table, never written
  beside it. A hand-written column goes stale the first time an affinity is
  retuned, and the failure is silent — nothing throws when the game sends a
  player after the wrong monster. Same rule the signature check already followed
  in M1.7: assert against `guaranteedDrop`, not against a second list.
- A test that recomputes the predicate it is checking is not a test. The first
  version of the drop-source check asked "is this claim consistent with the rule
  that produced it", which passes by construction and would have gone on passing
  the day `rollBase` changed how it pools. Asking the ROLLER — six thousand
  samples per creature — is the only version that can fail, and widening the
  band rule by one makes 51 of the 181 claims fail.
- A signature is stated on its own and never merged into the list of things that
  merely tend to carry it. "The troll's own" is a reason to go somewhere and
  "often carried by trolls and ghosts" is a shrug, and blurring the two spends
  the one real hook in the loot table on a hint.
- Everything says something, and the fallback is the RING. Twenty-two of the
  hundred and seven are made of a material no creature's affinity covers, and
  "nothing is known about this" is a worse answer than "the far corners" — which
  is true, useful, and the one rule the whole world is laid out by. Bands are
  spoken as distances from the anvil, because quoting an internal number at
  somebody holding a shield is not an answer.
- The signature goes on the target frame and NOT the nameplate. The frame
  requires selecting the thing, which is the walk-up-and-look gesture the rest of
  the game is built on; a line over every boss in a camp is exactly the clutter
  the nameplate hierarchy exists to avoid — the same argument that reserves the
  corner toast for the top two qualities.

- A cost that can only be paid by repeating the cheapest activity in the game is
  not a decision, it is a wait. The reforge ladder's last step was 1,256 wood and
  ore — ninety gathers — and every number in the curve was defensible while its
  shape was not. The fix was not a smaller number: it was making the superlinear
  part of the cost a DIFFERENT question, so the raw line could go linear and the
  top of the ladder could ask for a trip to the bench rather than another lap of
  the same trees.
- Refining is one-way, and salvage never gives it back. Essence already came
  only from fighting; refined stock comes only from the fire, and a laundering
  loop through the forge would make both untrue. That is what makes the top of
  the ladder a commitment rather than a position you can back out of.
- Two refined materials rather than one per gatherable. Gear is made of a hard
  part and the binding that holds it on, so every good item wants both — in the
  ratio its slot leans, reusing the metal/soft split `forgeCost` already made.
  One per gatherable would have been symmetry for its own sake, and one on its
  own would have left half the wallet with nothing to do at the top of the game.
- Wood is in both refine recipes because it is the FIRE. It gives the cheapest
  and most abundant gatherable a job in the endgame instead of leaving it as the
  thing every player has four thousand of and no use for.
- A batch pays out until the wallet runs out rather than refusing the request.
  The client sized the button off a wallet that was true when the panel last
  drew, and a gather landing mid-click is enough to make it stale — so refining
  nine of the ten asked for is the honest answer, and each step is its own atomic
  spend. Same argument SALVAGE_MANY already made about a partially-stale list.
- Wallet SQL is generated from the shared material list, not typed out. Four
  hand-written statements naming the same four columns is four places a fifth
  material has to be remembered in, and the failure is silent: a spend that
  forgets a column simply never charges for it. `MATERIALS_UPDATE` stopped
  enumerating its keys for the same reason `CONSUMABLES_UPDATE` never did — that
  file owns the wire format and `items.ts` owns the content.

- A bag slot holds a kind, not an instance, and the CAP moved with it. Grouping
  the display while leaving the cap counting rows would have been worse than not
  grouping at all — the grid would show empty cells and the game would still
  refuse the drop. The kind is the item's NAME, because that is what a player
  reads off it: two things called the same thing are interchangeable to whoever
  is carrying them, and a tenth of a point of jitter is not a reason to spend a
  second cell.
- "Does one more fit" is asked with the item, never as a count. The answer
  depends on WHAT is arriving — a seventh Worn dirk fits into a bag of thirty
  full cells and a Frostbrand does not — and computing it by counting the cells
  the bag WOULD use is exact by construction rather than a second copy of the
  spill rule that can drift from the first.

- A test that shares a world with a live game must assert on IDENTITY, not on
  counts. Something is usually hitting the character, so a stray real damage
  number lands mid-probe and "six elements" becomes seven. And a test character
  persists by name, so reusing one means the second run starts with the first
  run's bag and none of its materials — the forge check then fails for a reason
  that has nothing to do with the forge.

- A reforge re-rolls what the DICE gave and keeps what was paid for. This
  reverses half of M3's "an etched affix is indistinguishable from a rolled one"
  and it is worth being precise about which half. That decision was about a
  difference the player could FEEL and could not SEE — and it still holds: two
  Tempests do exactly the same thing to a monster whichever way they arrived.
  What it also did, unintentionally, was make etching an endgame-only verb by
  accident: every step up the ladder erased it, so "the ladder decides how many,
  etching decides which" was false for anything you meant to keep improving. The
  fix is not to soften the ladder — rolled affixes are still entirely at the
  fire's mercy — it is to say that a rune and a measure of essence buy a slot
  outright, and to SHOW the mark everywhere the fire treats it differently.
- The trap was fixed rather than better signposted. The Etch tab's whole guidance
  was an ordering rule — reforge first, then cut — which is a sign beside a hole
  rather than a filled hole. A verb whose correct use is "not yet" is a verb
  nobody uses. Worth generalising: when the only thing a panel can say about a
  feature is which order to do things in, the ordering is the bug.
- An invisible difference is what the original argument was against, so the mark
  is stated in three places rather than kept in the schema. The tooltip says it
  on the affix line, the reforge row names what it will keep BEFORE the click,
  and the bag edges the cell. Anything less would have re-created the exact
  failure the "indistinguishable" rule existed to prevent, one level up.
- `etched` is a SUBSET claim and every subset claim goes stale. A re-roll, an
  etch over an earlier etch, or a row from an older build can each leave a mark
  behind an affix that is gone — and a stale mark reaching the roller is an
  instruction to preserve a slot the item does not have. It is therefore narrowed
  against `affixes` on the way out of SQLite, again in `survivingEtched`, and
  again after the roll. Three filters for one invariant is not belt-and-braces:
  it is the same call `toItemInstance` already makes about `baseId`, which is
  that a bad row must not be able to take anything downstream with it.
- The bag cell had to move with the rule, not after it. Etching does not change
  an item's NAME, so a paid-for sword and a plain one shared a cell the moment
  this landed — and a cell salvages its whole pile, which M2.1 called safe
  "precisely because a stack is homogeneous by construction". That sentence was
  load-bearing and this feature falsified it, so `stackKeyOf` carries the marks.
  Worth remembering as a shape: a stacking rule is a claim about what is
  interchangeable, and any new property that makes two same-named things behave
  differently is a change to that claim whether or not it looks like one.
- A test that can pass by luck is a test that will. Removing the preservation
  makes 34 of 400 reforges still hold the rune, because the eligible pool is only
  twenty-odd entries — so a one-sample version of this check would have gone
  green about one run in twelve, which is exactly often enough to be believed and
  rare enough to be maddening. Sample count is not padding when the thing under
  test shares an outcome with chance.

- Physical is a SCHOOL, not the absence of one. An untyped default would be the
  one kind of damage nothing in the world could have an opinion about, which
  means a golem could never be the thing a sword is bad against — and "what you
  are holding decides what you are good against" would only ever be true of
  casters. It also gives every untaught caller a real answer: `resolveHit` with
  no school deals physical and takes no resistance with it, so nothing that has
  not learned about schools yet silently deals an element.
- A resistance is never an immunity, and the cap is enforced on READ rather than
  trusted from the table. The premise of the game is that you may pick up any
  weapon and walk in any direction, so a profile is allowed to make a choice
  better or worse and never to make one unplayable. Authoring inside the cap is
  a convention; clamping in `resistOf` is a rule, and the damage floor of 1
  underneath it is what makes "slowly" rather than "never" true at every
  magnitude.
- Resistance before armour. They answer different questions — resistance is what
  a thing is MADE of and scales with the size of the blow, armour is a barrier in
  front of it and does not — so subtracting armour first would make a resistance
  worth less against a heavily armoured target than a lightly armoured one, which
  is exactly backwards. And armour applies to every school rather than to
  physical alone: the tempting split hands elemental damage a free pass around
  the one stat the whole game is balanced against, and would have made a dragon's
  breath unanswerable by anything a player could wear.
- A weapon's school is DERIVED from its family and its material, never authored
  per row. Thirty-six hand-typed answers to a question the palette had already
  answered is thirty-six chances for Frostbrand to be steel-coloured frost
  damage. The precedence is what needed deciding rather than the values: the
  family is the floor (a staff throws a bolt and has never swung), the material
  overrides it, and only four of the twelve palettes are elemental — because if
  every material were an element then "elemental" would be the default and would
  mean nothing.
- A skill DECLARES its school rather than inheriting it from `effect`, even
  though the two agree for most of the table. `effect` names a row of the sprite
  atlas — it is how a skill LOOKS — and letting it decide damage would mean a
  school could never change without changing the art, and choosing art could
  change the balance. Rend and Backstab draw blood with a `slash` sprite and are
  physical, which is the disagreement that proves the separation is real.
- Five resistance keys on `PassiveBonus` rather than one nested bag. That
  interface is the reason affixes, matched sets and talents all reach combat
  without any of them knowing the others exist — `addPassives` sums a flat record
  and every consumer reads a flat record — and a nested `resist: {...}` would be
  the single member needing its own adder, its own label rule and its own line
  everywhere one of these is totalled. There is deliberately no physical key:
  armour is the physical answer and has been since Phase 14, and two stats doing
  one job is how a number becomes impossible to tune.
- The test wrote four of the balance numbers, and that is the point of writing it
  first. It failed with nothing weak to physical, nothing weak to nature, and
  nothing resisting arcane or lightning — meaning the school twenty-five of
  thirty-six weapons deal had no camp where it excelled, and two elements existed
  only as words. None of that throws, none of it shows in a screenshot, and no
  reviewer would find it by reading thirteen monster rows. The bestiary was
  rewritten against the failures rather than the check being relaxed.
- "Every element needs something WEAK to it" is the assertion that earns its
  place. Something resisting an element makes it a trap; something folding to it
  is what makes it a reason to go and get one. An element that is only ever a
  penalty is an element nobody chooses.
- Resistance affixes are band 3 and up, and the floor is doing work rather than
  being caution. A resistance is situational — decisive against one camp and
  worthless at the next — and situational is only a decision for a player who
  already owns gear to choose between. Rolling them from band 1 would mostly mean
  a new player's only weapon carried a stat that does nothing for the first three
  rings, since band 1 and 2 creatures have no schools at all.
- "The same numbers" became a lie the moment a weapon had a school. Two weapons
  can roll identically and still answer different creatures, so the tooltip's
  comparison now leads with the school change when there is one. Found by looking
  at a screenshot rather than by a test, which is the class of thing screenshots
  are still for.

- One table for every timed effect, and the argument is the one the consumables
  table already won. Four hand-written versions of "a modifier expires at T" was
  never four ideas; the cost was that the fifth needed a fifth store, a fifth
  expiry branch and a fifth integration into damage — and that every one of them
  reached combat by its own route, so no two behaved quite alike and none of
  them could be shown on screen without bespoke work.
- A status speaks `PassiveBonus` and therefore needs no plumbing. That interface
  is why affixes, matched sets and talents all reach combat without knowing
  about each other, and a timed effect is the fourth thing of the same shape.
  The proof it was the right call: War Cry's and Weakened's bespoke damage
  multiplications were DELETED from the combat code rather than rewritten, and
  three of the eight new skills needed no server branch at all.
- Refresh rather than stack, and clamp on top. A second cast buys DURATION. Two
  slows that multiply without a floor are a root, two marks that multiply
  without a ceiling are a one-shot, and both are the same failure the resistance
  cap exists to prevent one system over: a rule that makes a choice better or
  worse must never make the game unplayable.
- A dot is real damage of its own school rather than a special kind of tick.
  That means a burn is resisted by fire resistance with no second rule, and it
  means the number that floats off a tick is comparable with the number that
  floats off a firebolt. It also has to carry WHO applied it, or a poison that
  lands the killing blow credits nobody with the kill.
- One new skill per weapon TREE, which is a rule about coverage rather than a
  wish for particular effects. Left to taste the list would have been three
  caster spells, because that is where buffs and debuffs are easiest to imagine
  — and a status system half the game cannot use is half a system. "You are
  whatever you're holding" only means something if every weapon gets a new thing
  to hold.
- `appliesSlow: boolean` had to become `applies: StatusId`. A boolean can only
  ever name one effect, so six skills used it to mean six slightly different
  things and two of them were not slows at all — Rend opens a cut and Poison
  Arrow puts venom in the blood. That is the same four-bespoke-maps shape one
  level up: the moment a second kind of rider existed, a boolean would have
  needed a second boolean beside it.
- Monsters inflict statuses too, or the harmful half is something the player
  does and never something done to them. Before this the player's own debuff row
  had exactly one thing it could ever show — Weakened, after dying — which made
  the whole left/right, buff/debuff separation an arrangement for a row that was
  never going to have two sides. As a CHANCE and never below band 3: every swing
  landing a debuff makes it a stat rather than an event, and the point of an
  indicator is that something changed.
- Three signals separate a buff from a debuff, and the redundancy is deliberate.
  Colour alone excludes anyone who cannot tell green from red. Position alone
  stops working the moment one side is empty. Shape alone is subtle at 26px.
  Position, shape (a notch, so the silhouette differs in greyscale) and colour
  together mean any one of them is enough, and the tooltip says the word as
  well, because that is the one place there is room to be unambiguous.
- Time drains as a sweep, not as digits. Digits at that size are unreadable at a
  glance and the question is never "how many seconds" — it is "is this nearly
  gone". Only debuffs pulse at the end, because what you want to know about a
  debuff is when it STOPS and what you want to know about a buff is when to cast
  it again, which the sweep already says.
- The sweeps drain against the SERVER's clock, advanced locally between
  snapshots. End times are the server's; a machine whose clock is a second out
  would show every effect ending early, and a machine an hour out would show
  every effect as already expired.
- The status row publishes its own height into the measured layout chain rather
  than sitting at a chosen offset. Its first version was positioned by looking at
  one screenshot and drew the whole row underneath the target frame — which
  EVERY DOM assertion passed straight through, because the markup was correct
  and only the pixels overlapped. Worth generalising: a test that queries the
  DOM cannot see a layout bug, and the fix for a layout that has four
  show/hide combinations is never a number.
- The character sheet had to learn about statuses the same day the server did.
  The oldest rule in this project is that the stat sheet computes exactly what
  the server resolves combat with; `passivesOf` folded statuses in and the
  client's `passives()` did not, so Rallied gave eight armour in a fight and the
  window reported the figure from before the cast. The Statistics tab now lists
  "Running effects" as a fourth source beside talents, affixes and matched gear.

- The title screen is the game, rendering. There is no artist on this project —
  every surface is procedural or CC0 — so a painted splash would be the one
  asset nothing here could produce, and the one that would go stale the first
  time the terrain or the tree kit changed. Rendering the real scene means
  retuning the world retunes the front door in the same commit, and it cost a
  file rather than a budget.
- It sways across a hand-picked arc instead of orbiting. A composition is only
  true of one angle: the card on the left third, the forge on the right, the
  smith lit from the front. A full turn means most of every visit is a framing
  nobody chose — the subject behind the card, the figure a silhouette, the
  treeline gapping open behind the text. Twenty degrees either side is enough to
  be alive and never enough to leave the shot.
- The smith stands BEYOND the fire from the camera, and that is a lighting
  decision rather than a placement one. With the forge between the two, the side
  of the figure facing the player is the side the fire is on. The first version
  put it on the near side, where it was correctly lit — entirely on the face
  nobody can see — and read as a black cut-out in the middle of the frame.
- Nothing on the login screen is awaited. The scene builds in layers and each
  fades in when it lands, so the card is interactive on the first frame rather
  than after the trees have downloaded. The whole backdrop is also constructed
  inside a try: the front door of a game is the last place that should be a hard
  dependency on a working GPU, and a refused WebGL context now degrades to the
  flat gradient with every other behaviour unchanged.
- z-index is load-bearing here, not tidiness. `WebGLRenderer` appends its canvas
  as the last child of its container, so in paint order it sits on top of
  everything authored above it — the first version rendered a beautiful field
  with the entire login behind it. Worth generalising twice over: any element
  that a library appends for you is a sibling you did not order, and a test that
  queries the DOM cannot see it. The assertion that catches this asks
  `elementFromPoint` what is actually on top, which is the only question in the
  suite that is about pixels rather than about structure.
- The class tiles are derived from `WEAPONS` through `classForWeapon`, never
  written out. That function is the single thing that decides what you are, and
  the login page is the first screen of the game — a hand-written list would be
  a fifth place to remember a new weapon family, and the failure is silent:
  nothing throws when the front door explains the rules wrongly.
- A refusal has to say why. The old Play button accepted the click on an empty
  field and simply did not start the game, which is indistinguishable from a
  broken page. Same argument the M3 draw picker made about a button that did
  nothing, one screen earlier.
- The last character name is remembered. One name is one character here, so the
  name IS the account, and asking somebody to retype it every session is a
  password with no other purpose. Storage is wrapped in a try for the same
  reason the camera distance is: a remembered convenience must never be able to
  stop the game starting.

- This machine (a fresh Windows box picking up the project) had neither Git
  nor Node.js preinstalled; both were installed via `winget` (`Git.Git`,
  `OpenJS.NodeJS`) rather than assuming either was already present. Also has
  no attached display, so "confirm in-browser" here means headless Playwright
  (Chromium) driving the Vite dev server and screenshotting — installed into
  the scratch/temp directory, not as a repo dependency, since it's a
  verification tool rather than something the game itself needs. Worth
  reusing this approach for future in-browser confirmations on this machine
  rather than re-deriving a driver each time.

- **A school's home is a MATERIAL, never a field on the item.** (Phase 50)
  Lightning needed a weapon and the one-line answer was `school: "lightning"`
  on a row in the catalogue. That is the design M4 explicitly rejected, and it
  was right to: a hand-typed school is a chance for a frost-coloured sword to
  deal fire, silently, in a table two files from the one being read. So the
  cost of a new school is a new PALETTE, with everything a palette owes —
  three colours, a matched set, and enough items across enough slots for that
  set to be assemblable. Expensive on purpose. It is the rule that keeps a
  weapon's appearance and its damage from ever disagreeing.

- **A creature may fold to what it throws.** (Phase 50) Every element-bearing
  monster before the golem resisted its own school — a demon is made of the
  fire it throws — and the symmetry was starting to look like a rule. It is
  not. The golem deals lightning and takes 45% extra from it, because the seam
  is one thing seen from two sides, and because five elements could be worn
  against while only four could ever be thrown at you: `resistLightning` was a
  stat with nothing to answer. Where the fiction supports it, a shared
  weakness-and-weapon is more interesting than a matched resist.

- **A condition is DATA, and it is the same data the tooltip reads.** (Phase 50)
  Eight skills now change what they do depending on what is already running on
  their target. Every one of those could have been eight lines of `if` in the
  server's damage loop, and the loop would have been shorter. What that costs is
  that nothing else can see the rule: the talent panel cannot describe it, the
  hotbar cannot warn about it, and a test cannot ask whether the condition is
  reachable. `describeRead` and the server multiply from the same field, so the
  sentence under the node cannot drift from the number. This is the third time
  this file has made the same call — `applies`, then `school`, now `reads` — and
  it is the house rule at this point: if the player has to know it, it is a field.

- **A read may spend a BUFF.** (Phase 50) Every consuming skill in the genre
  eats a debuff off something else. Onslaught eats your own War Cry, and it is
  the most interesting button of the eight for exactly that reason: consuming
  something bad is a bonus with a cooldown attached, and consuming something
  good is a decision. Guarded so it never fires into empty air, because the one
  thing worse than a decision is a decision the interface took for you.

- **A statue is a person who stopped moving.** (Phase 51) Emberhold is generated
  because a downloaded building would arrive in a different stylisation from the
  trees behind it, and that rule held for two phases and produced an obelisk
  where a monument should be — four boxes and a cone, because a human is out of
  reach of a box kit. The rule is about BUILDINGS. The game already ships people
  in exactly this stylisation, so the statue is the Warrior rig holding one
  frame of its own idle, painted stone. Generate what a pack would clash with;
  reuse what the project already draws.

- **Spawn is an origin; arrival is a place.** (Phase 51) They were one constant
  and that quietly reserved the middle of the town square for nobody to stand
  on, because anything put there was something players materialised inside.
  `PLAYER_SPAWN` still anchors every band, camp and node ring and must never
  move; `PLAYER_ARRIVAL` is where a person turns up and is free to be a few
  strides off it. Any "the origin is also the doormat" coupling is worth
  splitting the moment it costs a design decision.

- **An exclusion zone is the shape of the thing, not the shape of the area.**
  (Phase 51) The ground cover was kept out of a circle covering all of
  Emberhold so that flowers would not grow through the paving — and the paving
  is two thirds of that radius, so the fix deleted every plant in the belt as
  well. "Big enough to definitely cover it" is the reflex and it is how a
  precise problem becomes a blunt one. Exclusions get a list.

- **Placement by bearing needs a test.** (Phase 51) Seven props had been
  standing INSIDE buildings — a bench, two lamp posts, planters, a handcart —
  some of them for two milestones. Nothing threw, nothing looked wrong, because
  a prop inside a building is only visible from the back of that building. Any
  time a position is authored as an angle against a ring, the thing it might
  land in has to be asserted against, or the failure is silent by construction.

- **Hide one mesh at a time.** (Phase 51) The seam across the square survived
  three rounds of reasoning — shadow frustum, light falloff, terrain tiling —
  and every one of those explanations was coherent and wrong. It fell in one
  step to toggling `visible` on individual named meshes. For a rendering
  artifact, bisection beats theory, and naming the ground meshes (`town-paving`,
  `town-road`, `town-island`) is what made bisection possible from a console.

- **Height is free because nothing measures it.** (Phase 53) The play area was
  kept dead flat for four phases on the grounds that elevation would be "a lie
  the simulation does not know about". It is a lie and it costs nothing: every
  distance in this game is XZ and no formula anywhere reads a Y, so height
  cannot desync, cannot be exploited and never has to reach the server. The only
  game it would break is one with line of sight, and this has never had any.
- **Anything BUILT gets levelled ground under it.** (Phase 53) A paved square, a
  monument's apron, a cairn: all flat discs of geometry, and a flat disc on a
  slope has one edge in the air. `FLAT_SPOTS` is derived from the same tables
  the objects are, and derived rather than REGISTERED — the first version had
  the waystones call an `addFlatSpot` as they were built, which runs several
  awaits after the terrain mesh is generated and would have levelled the height
  function without levelling the ground.
- **When a shader looks wrong, check the bytes before the maths.** (Phase 53)
  Distant ground rendered pure black. Shadows off, fog off, shadow camera
  widened, normals off, detail off, ARM maps off — no change; flat red material
  — fixed. All of which said "your shader", and none of it was: Vite was serving
  `index.html` for six texture files downloaded after the dev server started,
  and the browser was decoding an HTML document as a JPEG. The tell was six
  different textures reporting one byte-identical content-length.
- **Tiling and monotony are two different problems.** (Phase 53) The terrain
  shader beat tiling in Phase 47 with two surfaces and two noise fields, and
  what it left behind was a field with exactly ONE kind of boundary in it. A
  bigger source texture fixes neither: the eye picks up the period first and the
  poverty of the vocabulary second. Four surfaces and three fields at
  non-multiple scales is the fix, and the slowest field — a regional drift over
  a hundred and fifty units — is the one doing most of the work.
- **Detail belongs where the camera can resolve it and nowhere else.** (Phase 53)
  A metre-scale multiplier on the ground albedo, faded out by 34 units. The fade
  is not an optimisation, it is what makes the layer possible: carried into the
  distance the same signal aliases into shimmer, which is worse than flat. Being
  gone before it can shimmer is what lets it be strong enough to matter
  underfoot, where a third of the screen is.
- **A world may grow without its difficulty rings growing with it.** (Phase 53)
  The bands were scaled with `WORLD_WIDTH` last time, on the argument that a
  band is a fraction of the map. That is true of a world with one place in it
  and false the moment there are two: the rings are tuned against character
  level and the reforge ladder, so stretching them to fill five times the ground
  would have re-paced the whole game to make room for a road. New land is
  FRONTIER — past the last ring — rather than a wider version of the old land.
- **A road is the first thing here that is not polar.** (Phase 53) Every other
  position in this world is a radius and a bearing, because distance from spawn
  IS difficulty. A road is not AT a distance, it crosses all of them, so it is a
  polyline — waypoints still in polar, because that is how the route was checked
  against the camp tables, smoothed into one curve that the client draws from,
  the torches are placed from, and the test walks.
- **The road is the safe way through.** (Phase 53) It passes near four camps and
  inside none of them, and that is a measured property with a test behind it
  rather than a happy accident. It is also the whole reason to build a road
  instead of drawing one: following it is a decision with a payoff, and cutting
  the corner meets mushnubs, wolves and orc brutes in that order.
- **A light and a flame are separable, and only one of them is expensive.**
  (Phase 53) Fourteen torches down four kilometres cannot each own a PointLight —
  three evaluates every one against every fragment of every lit surface. Every
  torch always has an emissive flame in the merged mesh, which is what makes the
  road read at night from as far as the fog allows; a fixed pool of five real
  lights is re-pointed at the nearest torches each frame. The seam is invisible
  because a torch too far away for its light is too far away for its ground to
  have been lit anyway.
- **A strip built in XZ winds the opposite way to one built in XY and rotated.**
  (Phase 53) The town's road arms and back lane are authored flat in XY and
  turned -90 degrees about X, which flips handedness on the way. The North Road
  is built directly in XZ, so copying their vertex order pointed all 5,184
  normals at the ground and the road was invisible from every angle a player can
  occupy. Diagnosed by counting normal signs in the live page, not by reading
  the code.
- **A verb needs somewhere to go before it is worth having.** (Phase 52) `reach`
  is a distance check and about ten lines. It was worthless until there was
  something to arrive AT: "go to (4880, 3104)" is a coordinate and the walk pays
  off in an empty field. Four waystones were most of the work and the objective
  was the small part, which is the right ratio — the same reason Storm was a
  palette rather than a field on a weapon.
- **Arriving is an event; standing is not.** (Phase 52) `MOVE` lands many times
  a second per player and the quest table is a database read, so crediting a
  position naively puts a query on the movement path for every player in the
  world, forever, to answer a question that changes about once an hour. Four
  hypots run per packet and the table opens only on the tick where the answer
  changed from nothing to something. Any check driven by position wants this
  shape: cheap geometry every frame, the expensive half on the edge.
- **Read the world's tables, do not restate them.** (Phase 52) The waystone test
  parses the real `ringPack` and `ringNodes` calls out of the server rather than
  keeping its own copy of where the camps are. A copy agrees on the day it is
  written and stops agreeing the first time a camp moves — which is precisely
  the failure the test exists to catch, so a copy would fail silently at the one
  moment it mattered.
- **A counter is only worth showing when it can be part way along.** (Phase 52)
  Every objective in the game reads "n / m" and a place cannot: you are there or
  you are not, and "places reached 0 / 1" is noise dressed as progress sitting
  next to the only word the player wants. `objectiveIsCounted` splits them, and
  a place shows its name and how far it still is instead.
- **An off-screen objective is an arrow, not a blip.** (Phase 52) The nearest
  waystone is 1,560px out and the widest minimap zoom shows about a third of
  that, so a dot appears exactly when it stops being needed. Clamped to the rim
  along its true bearing, with the distance under it, becoming a ring when it
  comes on the map. Only for work actually taken: marking every landmark makes
  the map a tourist guide, marking the one you were sent to makes it an
  instruction.
- **A townsperson's round is derived from the clock, not sent.** (Phase 51) The
  same call the day/night cycle made, for a stronger reason. An NPC's position
  depends on nothing any player does, so a message would be per-frame bandwidth
  for a value both ends can compute — but the real prize is that the server's
  "are you close enough to buy this" and the client's "draw the shopkeeper here"
  become the same function of the same clock and CANNOT drift. Two systems
  agreeing to stay in sync would have failed as "the buy button does nothing".
- **The range to START talking and the range to KEEP talking are different
  distances.** (Phase 51) Starting is measured to where somebody is standing,
  because you walk up to a person. Keeping is measured to their post, because a
  post does not move and a conversation must not end when the other party takes
  three steps. The second is the first plus the beat radius — a sum with a proof
  behind it, not a slack multiplier, which is what it replaced.
- **A path is placement with a time axis, and it fails the same silent ways.**
  (Phase 51) Every placement rule in `town.mjs` had to learn to walk the whole
  round rather than check one position: a stop two degrees out is somebody
  standing in a well, and a LEG two degrees out is somebody walking through the
  inn four seconds at a time — which is harder to catch by eye precisely because
  it is only wrong while it is happening. The sight-line rule added one
  milestone earlier went green on a beat that reproduced the exact defect it was
  written for, because it was still only looking at where people start.
- **Fix an occlusion problem at the feature, not at the placement.** (Phase 51)
  Keeping townspeople out of the monument's sight line required being right
  about when perspective lifts somebody clear of its crown, and three plausible
  derivations all disagreed with a raycast. Turning the through-walls silhouette
  OFF for townspeople solved it everywhere instead — behind the inn, the well
  and the palisade too — and it is the correct scope anyway: the outline exists
  so you can find the character you are responsible for, and a shopkeeper is not
  one. A permanent blue figure painted on fixed scenery is strictly worse than
  not seeing somebody who is behind it.
- **This game has ONE camera bearing, so "behind" is permanent.** (Phase 51)
  The camera looks along -z and only its distance moves, which means how far
  apart two things appear across the screen is their difference in world x and
  nothing else. A townsperson standing up-screen of the monument is not
  occasionally hidden by it, they are hidden by it forever — and since every
  actor carries a through-walls silhouette, the Herald was painted down the
  statue in outline blue at all hours. Placement rules that would be fussy in a
  game with a free camera are load-bearing in one with a fixed camera, so
  `STATUE_SIGHT_HALF_PX` is a shared constant and the town test enforces it.
- **A density and a size are one decision.** (Phase 51) The bunting's flags were
  shrunk to a fifth of their width to fix the arrowheads, and the spacing stayed
  where it had been set for the big ones — so the fix for one visual bug quietly
  created another, and the two constants were far enough apart in the file that
  nothing connected them. They sit together now with the ratio between them
  written down, which is the only thing that stops it happening a third time.
- **Size a monument against the ROOFLINE, not against the player.** (Phase 51)
  "Taller than a person" is the wrong test; every prop in the square is taller
  than a person. What makes a figure read as sculpture is beating its own
  pedestal, and what stops it reading as a cathedral is staying under the eaves
  of the houses round it. Those two brackets pick the number between them.
- **You may put a weapon down.** (Phase 50) It reads as a convenience and it is
  not. `classForWeapon` makes bare hands an archetype with its own ten-node
  tree, and with no unequip in the protocol that archetype was reachable exactly
  once per character, before their first weapon. A game whose premise is "you
  are whatever you're holding" has to let you hold nothing.

## Current status
Phase 0 through 70 complete (2026-08-24).

**Phase 70 M70.38 — the pacer had convinced itself the monitor was half
its real speed.** The overlay read `72Hz display, 1 frame per 2 refreshes
= 36fps target` on the same 144Hz machine that had read 143Hz two rounds
earlier, and that number is a bug I shipped in M70.33.
THE SPIRAL. rAF is called on a refresh boundary, and a frame that overruns
one is called again at the boundary AFTER it. So once the game is slower
than the display, EVERY gap between callbacks is two or three refreshes
and there is no honest sample of the refresh interval anywhere in the
data. Measured from those gaps, a 144Hz display reads as 72Hz — and then
the divisor is chosen against a DOUBLED budget, so a 13.7ms frame looks
like it comfortably fits a 13.89ms allowance, the pacer concludes
everything is fine, and never steps up. It locks itself at half rate
believing it has succeeded. Worse than the original problem, and entirely
self-reinforcing: because the divisor stays at 1 every frame overruns, so
no short gap is ever produced, so the measurement can never recover.
A percentile was the obvious fix and does not work, which the test proved
before the theory did: the information is not in the samples, because
every one of them is contaminated by the same cause. It has to be
OBSERVED. `PROBE_INTERVAL_MS` gives up one frame every three seconds and
draws nothing — the browser then calls back at the very next boundary, and
THAT gap is the refresh interval, measured rather than inferred. One
dropped frame in about four hundred, below anything a player can see, in
exchange for pacing to the real display instead of a halved guess.
`pacing.mjs` section 7 simulates the whole thing faithfully — a true 144Hz
tick, with a frame delivered at the next boundary that clears it — and now
reports 144Hz measured at both 13.7ms and 26ms frame costs, where before
the fix it read 72Hz and 36Hz. Mutation-tested by pointing the estimate
back at the ordinary gaps.
TWO MORE STALLS, both named by the hitch reporter. A 496ms frame whose
worst section was `render` at 465.8ms, landing immediately after the world
finished building — the first frame of a session compiling the terrain,
the town, the river, the road and every ground-cover species and tree at
once, inside `render()`. `warmUp(scene)` now runs before the loop starts:
the same work, done while the loading screen is still up, where a pause is
what the screen is FOR.
And the multi-second "BETWEEN frames" freezes, which survived M70.36 and
M70.37. `MAX_SPAWNS_PER_FRAME = 3` reads like a throttle and only limits
the cheap half — `actor.load()` returns immediately, and the expensive
part (cloning the rig through SkeletonUtils, cloning a material per mesh,
binding six actions, measuring lifts, building the silhouette and rim)
happens in the CONTINUATION whenever the promise resolves. Nothing bounded
those, so walking into a camp started a dozen builds within a few frames
and their continuations landed together, between frames, where no frame
timer could see them. Bounded now at two rig builds in flight, which fills
a camp visibly fast while never putting more than two clones in one gap.
Also of note: `warmup.mjs` failed on this commit for the right reason and
the wrong cause — it matched one exact promise shape, and bounding the
builds added a `.finally()`. Rewritten to match the load call and the
window after it, then re-mutation-tested. Full suite green.

**Phase 70 M70.37 — a skinned raycast on every frame, and the other lazy
fetch.** The reading came back with `render` still spiking (44-101ms) and
a section that had never appeared before: `targeting`, averaging 0.04ms
and spiking to 45ms, six times in one ten-second window.
THE PICK. `pickMonsterAt` runs on every frame the pointer is over the
canvas, and it disambiguated overlapping candidates with
`intersectObject(actor.root, true)`. That walks into the `SkinnedMesh` —
and three.js resolves a skinned raycast by computing the POSED WORLD
POSITION OF EVERY VERTEX IN THE RIG before it tests a single triangle.
Thousands of bone-weighted transforms, per candidate, per frame, to answer
a question about a mouse cursor. Triangle-exact picking was never worth
that here: these are creatures between 0.8 and 3.4 units tall, the
candidate list is already filtered to things within `PICK_CANDIDATE_PX` of
the cursor ON SCREEN, and the whole function falls back to nearest-on-
screen when nothing is hit. A sphere around the body answers the only
question the ray is actually asked — of the things under the cursor, which
is in front — and `Ray.intersectsSphere` is a dot product.
THE OTHER FETCH. M70.36 preloaded the thirteen monster models and the
multi-second freezes stayed: 2914ms and 1132ms, still "BETWEEN frames".
Preloading the monsters had removed the stalls it was looking at and left
a second lazy path standing — `gear.ts` fetches every WEAPON AND ARMOUR
model the first time one is seen, which is a drop being inspected or
another player walking up wearing one. Twenty-seven item art models and
ten wardrobe donors.
Deliberately NOT added to the loading screen, which was the obvious fix
and the wrong one: most characters will never hold most of this gear, and
a loading screen is not free just because waiting is expected there.
`warmer.ts` instead queues them and parses one at a time in whatever gaps
the browser has spare, through `requestIdleCallback` — which hands back a
deadline and only fires when nothing else wants the thread, exactly the
shape of work that has no hurry and only one requirement: not to land
during a fight. Serialised rather than fired together for the same reason
the stall existed at all, since three parses at once is a three-parse
stall. `loadModel` caches by name and returns the in-flight promise, so a
model the player reaches before the warmer does joins that fetch rather
than starting a second one — the warming can make something earlier and
can never make anything slower. `rig:` models are mapped back to the body
that carries the mesh, or the warmer would ask for a filename that does
not exist and quietly warm nothing.
This does not make parsing cheaper. It moves it to a moment nobody is
looking at, which for a cost that cannot be removed is the whole available
win. `warmup.mjs` gains a section for it: serialised not parallel, idle
not immediate, a fallback for Safari (which still has no
`requestIdleCallback` and would otherwise warm nothing at all), a catch so
warming can never be a source of errors of its own, and the `rig:` mapping.
Full suite green.

**Phase 70 M70.36 — both stalls were outside the render loop, and the
hitch reporter named them.** The reading that made this possible was the
first one taken with F3 open and the console visible at once, and the two
instruments built in M70.30 and M70.32 paid for themselves in one screen:
```
  [hitch]   55ms frame — worst section: render 53.7ms, 0ms outside sections
  [hitch] 3798ms BETWEEN frames — not the render loop.
```
Everything M70.34-35 did worked — `occluders` fell out of the top twelve
entirely (1.60ms to nothing), `render` 10.81ms to 8.90ms, draw calls 996
to 782, frame average 15.04ms to 11.47ms, and the pacer reports it is
holding 1 frame per 2 refreshes on a 141Hz display. And the player still
says laggy, because `fps` reads 46.8 against a 70fps target: twelve
stutters every ten seconds, worst 139ms, and neither kind is in the loop.
THE MULTI-SECOND ONES. Sounds have been preloaded since Phase 39 and
models never were, so the first time each of the thirteen monster kinds
came into view, its glTF was fetched and parsed on the main thread, in
play. That is a 3798ms freeze and an 1161ms one in a single session, and
no amount of work on the render loop could ever have touched it. All
thirteen are now requested during `start`, where there is a loading screen
to hide them and where `loadModel` already counts them through
`beginLoad`/`endLoad`. Not awaited — blocking the world on a dragon the
player will not meet for an hour is the wrong trade, and the cache returns
the in-flight promise, so a monster that does arrive early joins the same
fetch rather than starting a second one. Written as a loop over
`MONSTER_MODELS` rather than a list, so a fourteenth kind is covered the
moment it is added; a hand-written list would be a second place to
remember, and forgetting costs a multi-second freeze in exactly one corner
of the map.
THE 55ms ONES. three.js compiles a material's program the first time it is
rendered, and does it SYNCHRONOUSLY inside `render()` — so every monster
arriving in view paid for its own shaders in the middle of a frame. Steady
render was 8.90ms and these were 52-85ms, a dozen times in ten seconds,
which is exactly the profile: worst section `render`, nothing outside the
timed sections. `World.warmUp` calls `compileAsync`, which uses
KHR_parallel_shader_compile where the driver has it and therefore does the
work OFF the main thread; passing the object as the scene and the real
scene as `targetScene` is how three.js is asked to compile one thing
against the lighting it will actually be drawn under. Both actor paths —
monsters and remote players — now add the rig hidden, warm it, and show it
after. The creature appears a beat later than it used to and no frame is
spent on it.
`tools/test/warmup.mjs` guards both: that the preload iterates the table
rather than naming models, that it cannot reject its way out of `start`,
that the warm-up uses the async compile rather than the blocking one and
never rejects, and that BOTH actor paths hide-warm-show in that order —
mutation-tested by reordering one of them to show before warming, which
fails as it should. Full suite green.

**Phase 70 M70.35 — the allocations, and a tuning question answered with
"no".** Small follow-up to M70.34, and half of it is a decision not to
change anything.
The chunk size ground cover is bucketed into (`CHUNK_UNITS`, 26) trades
draw calls against vertices, and M70.34's density LOD changed that balance
enough to be worth re-asking. Measured properly rather than guessed —
`DistanceCuller` runs under Node, so a real field can be built at several
chunk sizes with the real species table and the real world dimensions, and
the cut averaged over five player positions so the answer does not depend
on where the grid happens to fall:
```
  chunk   total meshes   draw calls   instances drawn
     20           6000          334              3840
     26           3840          239              4120
     34           2160          175              5113
     44           1400          133              5571
     56            960          107              6037
     70            600           98              7857
```
Going from 26 to 44 is 44% fewer draw calls and 35% MORE instances drawn.
That is a trade, not a win, and which side of it is cheaper cannot be
settled without measuring on a GPU — so it stays at 26 and the table is
recorded here so the question does not get re-opened from scratch. The
same reasoning the shadow map and the pixel ratio got in M70.29: a change
with a real cost on both sides is not an optimisation, it is a preference,
and a preference needs evidence or a setting.
What did change is unambiguous waste. `fadeOccluders` cloned two
`Vector3`s per frame and `drawPlates` built a fresh `Set` per frame; both
are now reused. Individually invisible — the point is that the loop is
full of ones like them, and the only stutter still unexplained is a pause
BETWEEN frames, which is what a garbage collector does. Removing the cheap
ones is worth doing on principle even though no single one of them will
show up in a reading.

**Phase 70 M70.34 — thinning what survives, and a ray that asked the whole
world a question about twenty-two units.** Two cuts aimed at the two
biggest numbers in the last reading, `render` at 10.81ms and `occluders`
at 1.60ms.
The occluder fade casts one ray from the camera to the player's head to
find whatever is standing in the way, and it was handing the raycaster
`[...nodes, decor, ...buildings]` with `recursive = true` — every tree,
rock, bush and building in the world, traversed and bounds-tested on every
frame, plus a fresh array allocated to hold them. A tenth of the frame
budget to answer a question about a line that is AT MOST twenty-two units
long, because both of its ends — the camera and the player's head — are
within `CAMERA_MAX_DISTANCE` of the player by construction. So anything
whose bounds sit further than that from the player cannot possibly be on
it, whatever direction the camera faces. That makes the filter exact
rather than heuristic, which is why it can be as aggressive as it is. The
candidate list is now rebuilt only when the player has moved two units
(the same threshold the culler uses) and each object's bounding sphere is
computed once and cached, since every one of them is scenery that will
not move for the life of the world.
The second is a real LOD, and it is the first thing this performance run
has done that changes what is drawn rather than only what is skipped.
Draw calls were already down to 996, so what is left is vertex and fill
work — 3.16 million triangles, essentially all of it ground cover — and
the only thing that moves that is drawing fewer blades. Culling answers
"is this worth drawing at all"; `coverDensityAt` answers "how much of it"
for everything that survived, by lowering `InstancedMesh.count`, which is
a draw-time value that costs nothing to change. The placements went into
each chunk in scatter order rather than sorted by position, so drawing a
prefix of the buffer is a thinning spread evenly across the chunk rather
than a bite taken out of one corner — that property was already true and
is what makes this a two-line change instead of a re-sort.
Measured against the real species table and the real world dimensions: it
removes a further 50% of the instances that distance culling had already
kept, at every quality level. Nearly invisible for the same reason the
culling is: a patch of grass forty units away is a texture of green, and a
texture of green with a third fewer blades is the same texture of green.
The one real hazard is thinning something a player can walk up to, and the
banded fractions alone did not prevent it — the bands are a proportion of
each species' own cull radius, and those differ by a factor of two, so a
pebble retired at 39 units reached its first band at about 18 and the
chunk the player was STANDING IN could have been drawn thinned. An
absolute floor of 30 units, checked before any proportion, closes that:
past the camera's own 22-unit leash, so nothing that can be looked at
closely is ever touched. `culling.mjs` asserts it directly, along with
monotonicity (further away is never denser), that `count` never exceeds
what was allocated or falls below one, and that anything without a
`fullCount` — trees — keeps every instance, because a wood with a third of
its trees missing is a different wood. Full suite green.

**Phase 70 M70.33 — the monitor was the missing number.** Four rounds of
profiling were measured against 16.67ms because that is what 60Hz gives
you, and the display is 144Hz. The budget was never 16.67ms; it is 6.94ms,
and 15.04ms is not "just over the line" but less than half the required
rate. Every "you are fine now" in the last three entries was measured
against a monitor the player does not own — worth recording as a plain
mistake rather than a subtlety: the refresh rate is an input to every
frame budget and it was never once asked for.
The more useful half is that raw speed is not the whole of it. A display
shows a new image only on a refresh boundary. At 144Hz those are 6.94ms
apart, so a 15.04ms frame lands on the wrong side of two of them and the
right side of three — ALTERNATING. The picture advances 13.9, 20.8, 13.9,
20.8ms while the game's own clock advances evenly, and the eye reads that
unevenness as stutter far more readily than it reads a low frame rate.
Which is why 62fps here looks worse than a locked 48 does, and why the
profiler could honestly report zero stutters while the player was
describing exactly that: nothing was slow, things were merely uneven, and
nothing was measuring evenness.
`pacer.ts` picks a whole number of refreshes per frame and holds it, so
every frame lasts exactly as long as the last. It MEASURES the display
rather than assuming one (the web exposes no refresh rate, so the only way
to know is to watch how fast rAF is called, taking the median so a few
long frames during load cannot convince it the monitor is 40Hz), and it
skips the whole loop body on unpaced frames rather than only the render —
the point is to fit the work into the budget, and doing the logic anyway
would spend a third of it. `clock.getDelta()` is read only inside
`loopBody`, so it returns the accumulated time and movement stays correct.
The decision rule is where the real care went, and its first version was
WRONG in a way that only shows on hardware the author does not have. It
applied its safety margin in both directions, so a 60Hz machine at 15.04ms
— comfortably inside its own 16.67ms budget, genuinely making 60fps — was
demoted to 30 for missing an 82% margin it never needed to meet. Caught by
running the rule across a table of displays and costs before shipping it
rather than after. Missing a budget is a FACT (the frame does not appear);
the margin is only a guard against oscillating, so it belongs on the
reversible half. Step up when the budget is genuinely missed, step down
only with headroom.
Settles at: 144Hz/15.04ms to 48fps evenly, 144Hz/12ms to 72, 144Hz/6ms to
the full 144, 60Hz/15.04ms left alone at 60, 60Hz/20ms to 30, 240Hz/15ms
to 80. `tools/test/pacing.mjs` drives a real pacer through simulated
displays and asserts all of it, including that the chosen divisor's budget
actually fits the frame (pacing that does not fit is a lie and the cadence
is still uneven) and that it stops changing once settled. Mutation-tested
by reinstating the two-directional margin: the 60Hz regression fails
exactly as it should.
Where this leaves the machine in question: 48fps, evenly paced, which
should look substantially better than 62fps did. 72fps needs the frame
under 13.89ms and it is at 15.04 — 1.2ms away, well within reach of
turning shadows off, and the next thing to measure. Full suite green.

**Phase 70 M70.32 — timing the thing that happens between the frames.**
The GL error is gone and the freezes with it: `stutters /10s` 0,
`worst /10s` 22.6ms, 62.6fps at 15.04ms. But the console still showed a
steady stream of 51-235ms hitches, and every single one of them said the
same useless thing: `worst section: (sections not timed — press F3)`.
That message was the bug in the instrument. `begin`/`end` were gated on
the overlay being open, so the one fact a stutter report exists to carry —
which subsystem was slow DURING it — was only ever collected when somebody
already had the panel up. Nobody has the panel up at the moment a stutter
surprises them. Sections are now timed unconditionally: about twenty
`performance.now()` calls a frame, which does not register against a 15ms
budget, against having no idea at all what caused a 235ms freeze.
Then the larger blind spot, which the same reports were pointing at
without being able to say so. Frame time was measured `frameBegin` to
`frameEnd` — inside `loopBody`. Websocket messages are decoded and
dispatched SYNCHRONOUSLY BETWEEN animation frames, so a snapshot that
takes 80ms to apply lengthens no frame at all and was invisible to every
measurement taken so far; the picture simply stops. Same for a model
finishing loading, and for garbage collection. `frameBegin` now records
the gap since the last `frameEnd` and reports it as its own kind of
stutter — "BETWEEN frames — not the render loop" — with `between frames`
on the overlay beside the rest. A player feels the picture stop; whether
the browser was inside the loop or between two of them is a distinction
only the profiler cares about.
And the network dispatch itself is now timed, per message type, which
needed one small structural change: the message listener's whole if/else
chain became a `dispatch` method so it could be wrapped, and the profiler
became a module singleton so `net/socket.ts` can reach it without growing
a reference to the game. `net:parse` is separated from `net:<TYPE>`
because they fail for different reasons — parse cost tracks the size of
what the server sent, dispatch cost tracks what the client does about it.
`ui` and `world` sections were added to close the last untimed stretches
of the loop, so "outside the timed sections" now genuinely means outside.
Nothing here makes the game faster. It is all instrument, and that is the
point: four rounds of profiling produced real wins by measuring the right
things, and the thing that is left has never once been measured.

**Phase 70 M70.31 — the console said `shadow` and it was my fault.** The
fourth reading came with the console open, and it changed the subject
entirely. Steady state was FIXED: 60.3fps, 14.73ms average — under the
16.67ms line a 60Hz display gives you, which is what M70.28-30 were for —
853 draw calls, 2.72M triangles, cover down to 308 chunks. But the console
was full of a real GPU error, hundreds at a time:
`GL_INVALID_OPERATION: glDrawElementsInstanced: Mismatch between texture
format and sampler type (signed/unsigned/float/shadow)`.
That word `shadow` pointed straight at M70.30's own change, and reading
three.js's source settled it in one line. `WebGLShadowMap.render` begins
`if (autoUpdate === false && needsUpdate === false) return;` — and it
returns BEFORE allocating `light.shadow.map`. Every material in the scene
is compiled against `shadowMap.enabled`, so they all carry a
`sampler2DShadow`; with no map to bind, each one draws against the
renderer's default empty texture. One GL error PER DRAW CALL, which is
exactly why they arrived in hundreds — there are hundreds of draw calls in
the frame that produced them. And M70.30's `render()` set `needsUpdate`
from its own tick counter every frame, overwriting the `true` that
`applyQuality` had just set after disposing the map. Nothing threw, the
picture still rendered, and the only evidence was in a console nobody had
been asked to open until now.
The schedule moved into `quality.ts` as a pure function, `shadowSchedule`,
purely so it can be tested — it encodes a three.js behaviour that is
invisible from the call site and got written wrong the first time it was
done by hand. `hasMap` is not an optimisation in it, it is the correctness
condition: frames may only start being skipped once there is a map worth
keeping. `tools/test/shadows.mjs` asserts that on any frame without a map
the pass runs, at every interval and every tick; that once there is one,
interval 2 halves the pass and never skips twice in a row; and that no
level skips shadows it has not enabled. Mutation-tested by deleting the
`hasMap` line: 11 failures.
Reading that same source turned up a second thing. `PCFSoftShadowMap` is
DEPRECATED in this three.js — `WebGLShadowMap.render` warns and reassigns
itself to `PCFShadowMap` on the first frame — so M70.29's `softShadows`
knob read correctly, applied silently and changed nothing, which is the
exact anti-pattern the decisions log had just recorded about `antialias`
one entry earlier. Removed, with the reason written where somebody would
go to add it back, and `shadows.mjs` now guards both: no setting may be
offered for a filter three.js ignores, and none for a flag fixed at
context creation.
What is left, honestly stated. The frame budget is met and the stutters
are not: `worst /10s` 81.7ms with 3 stutters in ten seconds, and the
console showed far worse ones during load — 437ms, 258ms, 918ms — all
reported as "sections not timed", i.e. outside the loop entirely. That is
the signature M70.30's hitch line was built to produce and it points at
asset decode, texture upload or shader compile rather than at anything in
the render loop. Whether fixing this GL error also fixes them is genuinely
unknown: a driver taking an error path hundreds of times a frame is not
free, but it is not obviously worth 900ms either. Also unresolved and
deliberately not chased yet: two `THREE.Material: parameter 'map' has
value of undefined` warnings, which are cosmetic. And the profiler's new
per-tier split immediately earned itself — TREE chunks (395) now outnumber
cover chunks (308), inverting which of the two is worth attacking next.

**Phase 70 M70.30 — the stutter nobody could measure, and a second render
nobody asked for.** Third F3 reading, on Balanced: 54fps (from 32.5),
16.96ms (from 24.49), 859 draw calls (from 1372), 2,985,450 triangles
(from 4.7M), cover down to 655 chunks of 5126. M70.28 and M70.29 worked.
The report was still "choppy, and sometimes freezes", and both halves of
that turned out to be real and separate.
CHOPPY: 16.96ms is just over the 16.67ms a 60Hz display gives you, and
missing that line by a hair is VISIBLY worse than missing it by a lot —
frames alternate between one refresh and two, which reads as constant
judder rather than as a lower frame rate. So the remaining job was never
"make it faster" in general, it was "get under 16.67", which is a much
smaller and much more specific target.
FREEZES: unmeasurable, and the instrument was the reason. The profiler
reset its worst frame every 500ms window, so a stutter every few seconds
was only ever caught if it happened during the half-second somebody was
looking at — and the reading that came back said `frame WORST 20.7ms`,
which is not a freeze at all. Fixed by making `frameBegin`/`frameEnd` run
whether or not the overlay is open (two `performance.now()` calls a frame)
and reporting any frame over 50ms to the console by itself, with the
section that was slowest DURING that frame and — the part that is a
diagnosis in its own right — how much of it was OUTSIDE the timed sections
entirely, which is what garbage collection, a texture upload or a shader
compile look like. The overlay gains `worst /10s` and `stutters /10s`
beside the per-window figure, because a player saying "it freezes
sometimes" is describing a ten-second memory, not a five-hundred
millisecond one.
And one more real saving, which is the first thing here that is a trade
rather than a fix: the shadow pass is a COMPLETE second render of every
casting object in the frustum, and it ran at full frame rate whether or
not anything had moved. Almost everything that casts here is scenery that
will not move for the life of the world; what does move is a handful of
characters. `shadowEveryNFrames` puts it on its own schedule — 1 on High
(untouched), 2 on Balanced, and 0 on Performance where shadows are off
anyway. At 2 a character's shadow updates thirty times a second, which
under a top-down camera on a soft 1024 map is not something to see, and it
halves the pass. `autoUpdate` is left ON at interval 1 rather than the flag
being set by hand every frame, so the default path is exactly what it has
always been.
The profiler also splits chunks by tier now (`cover chunks` against `tree
chunks`) rather than reporting one total. They are cut at very different
distances — 39-78 units against 165 — and only the split can say which of
the two is still worth attacking, which is the question the next reading
has to answer.

**Phase 70 M70.29 — a pebble and a grass tuft were on the same schedule,
and the rest is taste.** Second F3 reading, from town rather than open
field: 32.5fps, 24.49ms average, `render` 19.09ms, 1372 draw calls,
4,698,827 triangles — and the number M70.28 added, **chunks drawn 1480 of
5126**. So the cut was working (71% of chunks retired) and was still
leaving too much: 1480 chunks of ground cover is most of 1372 draw calls
once the frustum takes its own share. Also new and worse: **frame WORST
71.6ms, with `render` peaking at 66.1ms** — the freezing, which the first
reading (21.6ms worst) had not shown at all.
Two changes, and they are deliberately different KINDS of change.
First, the remaining waste. M70.28 gave every ground-cover species one
radius, which put a 0.22-unit pebble and a 0.98-unit grass tuft on
identical schedules — and thirteen of the twenty species are under half a
unit tall (two clovers, four flowers, two mushrooms, five pebbles). Since
draw calls scale with species x chunks-in-range and NOT with instance
count, retiring the small ones early is most of what a cut can win here.
`coverCullRadius` now scales the radius by the species' own declared
`size[1]`, proportionally rather than in bands so a new species needs no
decision — it gets a radius the moment it declares a size. Floored at
half, and the floor does real work: a pebble scaled honestly would cull at
seventeen units, INSIDE the camera's own 22-unit leash, and would wink out
while the player could still walk over and look down at it. Radii now span
39-78 instead of a flat 78. Moved into `culling.ts` rather than kept
beside the table, because `scatter.ts` reaches into the asset loader and
the terrain and cannot be loaded under Node — keeping the rule
dependency-free is what lets the test call it for real.
Second, and not waste at all: `quality.ts`. What is left in the frame is a
2048x2048 soft shadow map re-rendered every frame, a device pixel ratio of
2, and multisampling — every one of which somebody is PAYING for and
getting something back for, at an exchange rate that depends on the
machine and the person. So it is a setting, not a decision: three levels
cycled with F4 and remembered per browser, sitting beside F3 on purpose
because the two are meant to be used together — one to see what a frame
costs and the other to change it. Defaults to `Balanced` rather than
`High`, because the reading this came from was 32fps on a machine its
owner describes as not low-end, and `High` is demonstrably the wrong thing
to hand somebody who has never opened the setting. Pixel ratio is called
out in the file as the biggest lever and the least obvious: at a ratio of
2 the GPU shades FOUR times the fragments for identical draw calls and
triangles, and it moves no counter the profiler shows.
Two things worth recording about applying it live. `mapSize` alone does
nothing — three.js goes on rendering into the texture it already allocated
at the old size, so the shadow map has to be disposed to force a rebuild.
And every material in the scene is compiled against the shadow TYPE, so
switching filters needs every program invalidated — which is a stall of a
second or more, and is therefore guarded to fire only when the shadow
model actually changed, or nudging the pixel ratio would recompile the
world. Antialiasing is deliberately NOT in `QualitySettings`: it is fixed
when the WebGL context is created and cannot change on a live renderer, and
a knob that silently does nothing is worse than an absent one.
`tools/test/culling.mjs` gains both: that the tallest species keeps the
full radius, the shortest is retired well under it, the radii genuinely
differ, and — the one that matters — that NO species is ever culled inside
the camera's own reach, checked for all twenty. Plus that `Performance`
draws strictly less than `High` (47 chunks against 22 on the test field)
while still leaving ground under the player. Full suite green.

**Phase 70 M70.28 — nothing in this world was ever culled by distance.**
M70.26's profiler paid for itself on its first reading, and the numbers
settled the question completely rather than narrowing it: 47fps, 17.81ms a
frame, `render` 14.63ms of it, and EVERY line of JavaScript in the loop
adding up to about 2.4ms (occluders 1.17, hud 0.41, actors 0.25, plates
0.20, npcs 0.16, minimap 0.11, and the rest under a tenth each). So the
loop was never the problem and no amount of tightening it could have been
the answer. 1143 draw calls and 4,264,503 triangles were.
The cause, once looked for: ground cover is about eighty-two thousand
plants over a 400x300-unit world, already chunked per species SPECIFICALLY
so the frustum test can reject what is off screen — and that half works.
Nothing anywhere rejected what was on screen and far away. The camera sits
at most 22 units from the player and looks toward a far plane at 400, so
most of the map is inside the frustum at any moment, and every blade of
grass in it was being transformed and rasterised at full detail while
covering a fraction of a pixel.
`culling.ts` cuts by distance, with a radius per KIND rather than one
shared number, because a 0.3-unit clover and a 12-unit pine do not stop
mattering at the same range and one cut would either hold the grass too
long or pop the trees. Ground cover goes at 78 units — outside the
camera's own 22-unit leash, inside the fog's 55-unit near plane, and far
past where a third-of-a-metre plant is sub-pixel. Trees go at the fog's
FAR plane, 165, which is not a number of their own at all: `THREE.Fog` is
linear, so past its far distance a tree has already been fully replaced by
sky colour and drawing it cannot change a pixel. It works on each chunk's
own INSTANCE bounding sphere — the one both builders already compute from
their placements, because the prototype's own sphere sits at the origin
and culling against that would hide the entire world at once — and it
toggles `.visible` rather than removing anything, so three.js skips the
subtree before any per-object work while the instance buffers stay
resident and walking back toward a wood re-uploads nothing. Re-evaluated
only after the player has moved two units: standing still is the common
case and re-deciding a thousand booleans sixty times a second for a camera
that has not moved is the same class of waste being removed.
Verified as a RUNTIME test against real three.js (`tools/test/culling.mjs`)
— `InstancedMesh` and `computeBoundingSphere` are pure JavaScript, the
same realisation M70.27 turned on the animation system. Built a real
192-chunk field over the real world dimensions and measured: 47 of 192
chunks drawn at the world centre, a 76% cut, BEFORE frustum culling takes
its own share. The correctness half matters more than the saving and is
where the silent failures live, so it checks both directions: nothing
inside the radius is ever dropped, the chunk under the player survives at
five positions including all four corners, a sub-threshold move does not
re-decide the field, and every chunk's sphere is distinct — that last one
guards the exact mistake of culling against the prototype's sphere, which
would make the world vanish all at once and throw nothing. Full suite
green including `forests.mjs` and `ground.mjs`.
Deliberately shipped ALONE. The other candidates are all real costs and
all visual trade-offs — a 2048x2048 PCFSoft shadow map re-rendered every
frame, `setPixelRatio` capped at 2, `antialias: true` — and stacking them
with this would make the next profiler reading unattributable. The
profiler now also reports chunks-drawn against chunks-total, so the next
reading says directly whether this earned its place.

**Phase 70 M70.27 — the combat slide, reproduced: an action three.js
turned off and nothing could turn back on.** M70.25's death-lock was real
but it was not this: reported again as still happening, "especially in
combat", which is the detail that mattered. Combat means one-shots
interrupting a stride, so the question became what an interruption does to
the run action specifically — and the answer was in a fix this session's
own notes are proud of. `play` deliberately skips `reset()` for run
("RESUMING A STRIDE MUST NOT RESTART IT", the Michael-Jackson report),
which is correct. But `reset()` is the ONLY call in three.js that sets
`AnimationAction.enabled` back to true, and three.js turns that flag off
BY ITSELF: `_updateWeight` sets `enabled = false` on an action whose
crossfade-out reaches zero. So run became the one action in the game that
could be disabled and never re-enabled. And a disabled action is
unrecoverable through everything `play` does — `setEffectiveWeight(1)`
stores `this.enabled ? weight : 0`, so it writes ZERO; `play()` does not
touch the flag; and `_updateWeight` returns 0 without even evaluating the
fade-in interpolant `crossFadeTo` schedules, so the fade can never
complete and never re-enable it.
The trigger is auto-attacking while STANDING STILL: nothing calls
play("run") during the crossfade because you are not moving, and
play("idle") is refused by the `busy` guard, so run -> attack runs to
completion and run dies. Move again and `currentAnim` becomes "run" with a
weight of zero — full speed, frozen pose, rest of the session, nothing in
the console. Idle and attack keep working throughout because they still
`reset()`, which is exactly why standing still looks completely normal and
only moving is broken, and why this read as intermittent rather than as a
hard failure.
Fix is one line — `next.enabled = true` before `setEffectiveWeight`, which
READS the flag — and it keeps the stride-continuity behaviour the skipped
`reset()` exists for.
Verified by REPRODUCTION, not by argument. three.js's animation system is
pure JavaScript and needs no GPU, so `sliding.mjs` section 5 now builds a
real `AnimationMixer` with real clips and runs the exact call sequence:
the stride plays, an attack crossfades it out to completion, three.js
disables it, and the resumed stride comes back at weight 0.00 with the rig
not moving — then passes at 1.00 with the line in place. Mutation-tested
by stripping the fix from both the source and the model: 3 failures, the
right three. Full suite green; `fighting.mjs` clean first run.
Worth recording that M70.25's watchdog would have caught this one on its
own — `unstick()` calls `stop()`, and `stop()` calls `reset()`, which is
the flag's only route back — so the "sometimes" in the report is probably
the watchdog recovering after its one-second threshold rather than the bug
being intermittent. The watchdog stays as the backstop it was built to be,
but the cause is fixed rather than papered over.

**Phase 70 M70.25 — the slide, found: a one-shot that never expires.**
Reported a fourth time, straight after M70.24 shipped. M70.22 and M70.23
were real fixes to a real WebGL context-loss bug and the symptom outlived
both, so this stopped reasoning about the renderer and read the animation
state machine's own guard chain instead. `Actor.play` is SIX early
returns and every one of them is a deliberate, silent no-op — which is
correct, because "the state you asked for is the state you are in" is the
common case and must cost nothing. Five of them are bounded: they stop
being true when a clip ends or when the requested state stops matching
the current one. The sixth is not. `play("die")` sets `oneShotUntil` to
`Number.MAX_SAFE_INTEGER`, and `busy` is a plain
`performance.now() < this.oneShotUntil` — so while `currentAnim` is
"die", `if (busy && this.currentAnim === "die") return;` swallows every
`play("idle"/"walk"/"run")` for the rest of the session, while
`stepMovement` goes on writing `playerX`/`playerY` every frame regardless.
That is the report exactly, including the part that made it so hard to
chase: NOTHING IS WRONG ANYWHERE AN ERROR COULD APPEAR. Nothing throws,
nothing warns, `mixer?.update()` swallows even a missing rig through its
`?.`, and `play("run")` is called every frame and returns without a word
in the locked case and the healthy case alike. A locked actor and a
running one are indistinguishable from outside, which is why three
sessions of reading the call graph did not settle it and why the console
never had the clue the user was asked to look for.
Modelled the guard chain in `tools/test/sliding.mjs` and ran 3600 frames
of held movement through it after a death: 0 animations started, exactly.
Two fixes. First, the one provable way in: `onHpUpdate`'s defeat branch
called `play("die")` unconditionally but scheduled its `revive()` INSIDE
`if (p.x !== undefined && p.y !== undefined)`, so a defeat arriving
without respawn coordinates locked the character permanently. All four of
the server's defeat sites do send a position today — and there is no
reason for the client's recovery from its own pose to depend on the
server's payload at all, so the `setTimeout` moved out of the guard.
Second, and the part that matters more: a WATCHDOG, because the lock
above is one route into a state that is undetectable by construction, and
naming a fourth cause after three wrong ones is not a plan. `watchForSlide`
measures the SYMPTOM, which is exact and which nothing else in the game
can produce — the body is translating and the pose is not. Both halves are
already here: `stepMovement` is the only thing that moves the local player,
and the new `Actor.poseClock()` sums the running actions' weighted times,
the same `AnimationAction.time` probe M70.5's verification used, promoted
from a test-only measurement into something the game can ask itself. After
a second of continuous movement with a bit-identical pose clock it logs
once — loudly, with `Actor.animationState()`: `currentAnim`, `baseAnim`,
`oneShotUntil` (printed as "MAX_SAFE_INTEGER (death pose, never expires)"
rather than as nine quadrillion), whether a mixer and instance exist, and
every bound and running action with its time and weight — and then calls
`unstick()`, which clears every gate `play` can be held by and asks for
the base state with `immediate` so the identity guard cannot swallow the
recovery too.
Verified: `sliding.mjs` proves the lock is real and permanent from the
source, that an ordinary expired one-shot does NOT behave that way, and
that `unstick` recovers. Its guard against re-nesting `revive()` was
mutation-tested — and the FIRST version of that check passed against the
mutant, which is worse than having no check, so it was rewritten to
brace-match the guard block properly and re-tested until it failed for the
right reason. Full suite green; `fighting.mjs` hit the known cactoro
keep-away flake and passed against a ghost on re-run. Flagged honestly:
this is the mechanism that fits every reported detail and it is now both
watched for and self-healing, but it has not been reproduced against the
user's own session — the next occurrence will print `[slide]` and its full
state, which is the thing that has been missing all along.

**Phase 70 M70.26 — a frame budget you can read.** Reported alongside the
slide: the game lags and freezes a lot, on a machine that is not low-end.
The render loop runs about thirty subsystems per frame — actors, npcs,
plates, minimap, indicators, targeting, day/night, road, river, ambience,
mist, town — every one added for a good reason and NOT ONE of them ever
timed. Optimising by reading that list and picking whichever looks
expensive is how a day gets spent making the cheap thing cheaper, so the
first thing built is the instrument. `profiler.ts`, toggled with F3, off
by default and costing one boolean test per section while off. It reports
average frame time (throughput — too much work every frame) and WORST
frame time over each window separately, because they are different
problems with different fixes and averages hide stalls completely: sixty
frames at 8ms and one at 400ms is a visible lurch and a respectable 22ms
average. Alongside them, `renderer.info` — draw calls, triangles, resident
geometries and textures, program count — sampled after the render because
three.js resets the per-frame counters at the start of each one. Sections
are sorted by cost, since the only question anybody opens it to ask is
which three of thirty are the problem. The GPU submission is timed on its
own line, because "the scene is too heavy" and "the JavaScript above it is
too heavy" are completely different diagnoses.
One measured-free win shipped with it: `World.follow` called
`sun.shadow.camera.updateProjectionMatrix()` on every single frame, though
`extent` derives purely from camera distance and is constant for minutes
at a time between zooms — now guarded on an actual change, with an epsilon
so the easing zoom's ever-smaller steps cannot defeat the guard. Nothing
else was touched: the obvious candidates (a 2048x2048 PCFSoft shadow map
re-rendered every frame, `setPixelRatio` capped at 2, 584 instanced
meshes) are all real suspects and all VISUAL trade-offs, and picking
between them without numbers would be guessing with the player's picture
as the stake. Ground cover was checked and already opts all but three
species out of casting shadows, so the one that looked most likely was
already handled. Awaiting F3 numbers before cutting anything.

**Phase 70 M70.24 — a status that never said how much.** Fresh sweep for
wire/table data with no client expression, mechanically: pulled every
field off the state and definition interfaces and grepped the client for
each. Most of what came back was correctly server-only (`MonsterStats`'
whole AI table — `fleeThreshold`, `leapRangePx`, `deathBurstDamage` — is
design data the client has no business quoting). One row was not.
`StatusDef` carries the mechanics of every timed effect in the game in
the one `STATUSES` table, and three of the four ways it expresses them —
`moveMultiplier`, `damageTakenMultiplier`, `dot`/`tickMs` — had **zero**
references anywhere in `client/`. The fourth, `modifiers`, reached the
client only as an aggregate: the character sheet's "Running effects" row
totals it, for the local player, mixed together. Hover the pip itself —
the one place a player actually asks what is on them — and all fifteen
statuses said a name, a category, and a `blurb`, which is written by its
own doc comment to say what an effect DOES and deliberately not how much.
So "moving at a fraction of its usual pace" was equally true of a 10%
slow and of Chilled's actual 60%. Two blurbs went further and made claims
nothing in the game could settle: poison's "it slows what it is in" (35%,
stated nowhere), and Marked's entire reason to be cast — "everything that
lands on it hits harder" — whose +25% the game had never once printed.
Same for Recovering, the two-second window a dodged slam opens, which
M70's own notes call "the best two seconds you will get on that
creature": +50%, unstated.
Added `statusEffectLines(def)` to `shared/items.ts` — beside
`passiveSummary`, not in `protocol-types.ts`, because that file's own
header records the no-cycle invariant (items imports protocol-types,
never the reverse) and because the vocabulary for what a modifier does
already lives there. The `modifiers` bag goes through `passiveSummary`
rather than being worded a second time, so a status granting armour says
"armour" in the same words an affix and a set bonus do; only the three
fields that are NOT `PassiveBonus` needed new words, because nothing else
in the game expresses them. A DoT's line carries its school in the
school's own colour, which is a direct reuse of the argument the item
tooltip already makes for putting a weapon's school on its own line — the
school is what decides whether the resistance you are wearing applies.
`attachTextTooltip` gained an optional `lines`, rendered as `tt-line`
rows BEFORE the flavour, matching the reading order the item tooltip's
own comment states ("what it does, what was rolled, and last the line
that is only there to be enjoyed"). Wired at both surfaces that show a
status: the player's own `StatusBar` pips, and `TargetFrame`'s row for
what you are fighting — the latter by `statusDef(status.id)` lookup
rather than by widening the wire payload, since that payload is already
only a projection of a table the client fully has.
Verified: drove the real shared formatter across all fifteen rows and
read the output back — every one produces at least one correct
mechanical line, no empties, with Poisoned correctly showing both halves
of the claim its blurb makes ("4 nature damage per second · -35%
movement speed"). Added section 10 to `tools/test/statuses.mjs`, which is
already the home of the "a modifier key nothing reads" class of silent
failure — every status must state at least one worded line, and every DoT
must name its school — then mutation-tested that guard by stripping
Marked's `damageTakenMultiplier` and confirming it fails rather than
passing quietly. `statuses.mjs`, `items.mjs`, `animation.mjs` and
`smoke.mjs` green; `fighting.mjs` hit the known cactoro keep-away flake
twice and passed clean against a mushnub on re-run. Flagged honestly: no
browser automation was available in this session, so the ~6 lines of DOM
append that render these rows were not seen on screen — they follow the
existing pattern in the same function, and the data half is verified
exhaustively, but the pixels are the part for a human to confirm.

**Phase 70 M70.23 — M70.22 fixed the renderer, not the rig.** Reported
again right after M70.22 shipped: the character still keeps sliding after
combat. M70.22's fix was real and verified (the render loop genuinely
resumes after a forced context loss), but a restored WebGL context does
not mean every GPU resource came back correctly — it means the RENDERER
is drawing again, using whatever three.js lazily decides to re-upload,
and a `SkinnedMesh`'s pose lives somewhere three.js does not
automatically rebuild on its own: `Skeleton.boneTexture`, the packed bone
matrices a rig is actually posed from, separate from the mesh's own
geometry. If that texture's old GPU handle came back invalid while the
JS-side object still believed it was fine, a character would render —
terrain, lighting, its own translating position, all genuinely working —
while its RIG stayed frozen at whatever pose the bone texture last held,
gliding across the ground in a locked stance. Exactly the report, both
times.
`webglcontextrestored` now explicitly rebuilds every `SkinnedMesh`'s bone
texture (`boneTexture = null; computeBoneTexture(); update();`) and marks
every texture reachable from every material in the scene `needsUpdate`,
rather than trusting three.js's own lazy re-upload path to catch
everything on its own. Investigating this one also ruled out several
real alternate theories worth recording so they are not re-chased:
directly forcing a monster's alive→dead transition confirmed the
death-burst code path throws nothing and correctly guards against
re-firing; instrumenting `Actor.update()` directly confirmed it keeps
being called at its normal rate throughout, and that `currentAnim`
staying "attack" during continuous combat is CORRECT behaviour (an attack
order persists and keeps re-swinging on its own cadence for as long as a
target stays in reach, whether or not the button keeps getting pressed —
not a bug, just this session's own test scripts not accounting for it).
Verified live: forced a real context loss/restore cycle with real skinned
character meshes present and confirmed the skeleton's bone texture came
back with a genuinely new identity (not the same stale object silently
reused), rendering resumed, and nothing threw. `animation.mjs` and
`smoke.mjs` green; `fighting.mjs` clean. Flagged honestly in the commit:
this could not be proven against the user's own exact repro, only against
the best-understood mechanism that fits every reported detail.

**Phase 70 M70.22 — a lost GPU context nobody ever told to come back.**
Reported directly, and it was serious: attacked a monster, a few seconds
of lag, the walking animation vanished, and the character just slid
across the ground forever. Every earlier freeze/slide bug this session
found had a JS-level cause with a JS-level fix (M70.5's loop try/catch,
M70.14's animation reset). This one did not, and the difference showed up
by accident: reproducing it via a synthetic monster-death transition
surfaced a genuine `CONTEXT_LOST_WEBGL` event in the console — a real GPU-
level event, not application logic — and a repo-wide grep confirmed this
codebase had never once listened for `webglcontextlost` or
`webglcontextrestored`, anywhere. That gap explains every detail of the
report at once: losing the GPU context does not throw anywhere JS would
notice, so movement, network sync and every other piece of game logic
keep running completely normally and independently of it — only drawing
stops meaning anything, silently. And per the WebGL spec, a browser is
free to treat a lost context as PERMANENTLY gone unless the page calls
`event.preventDefault()` on the loss event — without that one call
(missing here entirely), what should have been a momentary GPU hiccup
(a driver reset, a background tab losing its GPU slot, resource pressure
under this game's own heavy instancing — "ground cover: 82287 plants...
584 instanced meshes" is not a light GPU footprint) had no path back at
all. Added the standard pair of listeners to `World`'s renderer:
`preventDefault()` on loss so the browser actually attempts restoration,
and a forced resize on restore as a cheap nudge against any stale
internal viewport state surviving past it. Verified live with the real
mechanism, not a simulation: forced an actual context loss and restore
through the spec's own `WEBGL_lose_context` test extension and confirmed
three things directly — `preventDefault()` was genuinely called (checked
via `event.defaultPrevented`, not inferred), the render frame counter
resumed climbing after restoration rather than staying stalled, and no
exception went uncaught anywhere in the cycle. `animation.mjs` and
`smoke.mjs` green; `fighting.mjs` clean.

**Phase 70 M70.21 — the leaderboard sorted on a number it never showed.**
Smaller companion to M70.20 from the same sweep. The server's own query
(`SELECT name, level, xp ... ORDER BY level DESC, xp DESC`) has always
used `xp` as the tiebreaker between two players on the same level, and
`LeaderboardEntry` has carried it across the wire the whole time —
`LeaderboardPanel` read `entry.name` and `entry.level` and dropped
`entry.xp` on the floor. Two players tied on level looked completely
identical in the list even though the ranking between them was real and
already decided. The local player's own HUD already draws this exact
ratio (`xp` versus `xpToNextLevel(level)`) as a bar; the leaderboard row
never got the same treatment for anyone else. Added a thin bar under each
name, clamped to 100% since `xp` is progress INTO the current level
(`addXp` subtracts and rolls to the next level's counter, never
cumulative-across-levels) and could in principle read momentarily over on
a stale snapshot. Verified live: fed the panel three synthetic entries —
one deliberately over-full to confirm the bar clamps rather than
overflowing its track, one at an exact half, one at zero — and read the
actual rendered bar widths and tooltip text back: 100%, 50%, 0%, all
correct, with zero rendering as a visibly present empty bar rather than
nothing at all. `animation.mjs` and `smoke.mjs` green; `fighting.mjs`
clean.

**Phase 70 M70.20 — a potion that looked ready when it was not.**
Broadened past the ally-visibility vein into a fresh sweep (day/night,
weather, waystones, salvage/runes and item tooltips all came back
genuinely clean — no gap worth forcing) and landed on the one system that
wasn't: the shared "gated" cooldown every healing consumable sits on
(`ConsumableDef.gated`, enforced server-side via `potionReadyAt`) had
existed with zero client expression since it was written. The only
feedback was a toast AFTER clicking too early — "Not ready (Xs)" — which
means the button itself lied in the meantime: full colour, fully
clickable, indistinguishable from a potion actually off cooldown. The
hotbar solved the identical shape of problem for skills a long time ago
(a curtain that sweeps as `readyAt`/`windowMs` count down) and the potion
button never got the sibling treatment. `CONSUMABLES_UPDATE` gains
`cooldownRemainingMs`, sent on every message rather than only the one
that started a cooldown — the same "one source of truth the client can
always resync from" reasoning the hotbar's own cooldown state already
follows, rather than a value that only ever arrives at the instant it
changes. The button itself needed no new element or style: while cooling,
its own count doubles as the countdown ("4s" instead of "3"), and the
`:disabled` styling that already dims an empty stack does the same work
for a stack that is merely resting. A self-rescheduling `setTimeout`
(not a bare interval) ticks the display down once a second and stops
itself the moment the cooldown clears. Verified live: drove the real
`onConsumables` dispatch path with a synthetic 6-second cooldown and
sampled the button's own text once a second — watched it count down 5s,
4s, 2s, 1s (headless timer jitter skipped one exact tick, never showed a
stale or wrong number) before correctly clearing back to the real count
and re-enabling. `animation.mjs`, `smoke.mjs` and `items.mjs` green;
`fighting.mjs` clean.

**Phase 70 M70.19 — a threat off the edge of the plate.** The third,
smaller candidate from the same research pass as M70.18 — weaker payoff
(a hunting monster is usually close enough to be plate-visible soon
anyway) but the same shape of gap, so worth the small scope it costs.
`MonsterState.targetId` (M70.10) already drives the nameplate's red
"hunting" glyph; the minimap's own monster blips carry `engaged`/
`locked`/`dead` and stopped one field short. A monster bearing down from
outside nameplate range — the one distance band where the minimap is the
only thing that could say anything at all — gave no signal until it was
already close. Added `targetingMe` to `MinimapMonster`, drawn as the same
red ring the nameplate's own mark uses, but ONLY when the monster isn't
already `engaged`/`locked` — those two already get their own ring, and
stacking a third colour on top of an already-fought target would be
clutter answering a question that monster's UI has already answered
elsewhere. Verified live two ways: fed the draw code a synthetic
`targetingMe` monster directly and confirmed it draws without error, then
teleported a real character next to the nearest live monster (reading the
full un-filtered snapshot rather than `g.monsters`, which only holds
whatever is already within client-side spawn radius) and watched
`updateMinimap()`'s own output flip to `targetingMe: true` once the
server's AI actually picked the player up as its target — the full real
pipeline, not just the rendering half. `animation.mjs` and `smoke.mjs`
green; `fighting.mjs` flaked once on the pre-existing retreat-check noise
and passed clean on re-run.

**Phase 70 M70.18 — the last two places an ally still read like a
stranger.** Two direct, one-hop extensions of M70.13 and M70.17's own
stated purpose, closing out the two surfaces they didn't reach.
`Hud.plate()` has always drawn an HP bar off nothing but whether `hp`/
`maxHp` are present on the spec it's handed — no gating by `kind` — and
the monster call right next to the player one has passed real numbers
since the target frame existed; the player call, one line up, passed
neither. So a remote party-mate's PASSIVE nameplate — visible without
selecting them, exactly the case M70.13 built `playerHp` to answer —
still hid its health bar unconditionally, even though the data to draw
one has lived in that map since M70.13 shipped. Separately, M70.17 wired
a remote player's status straight onto their body but never kept a
`playerStatuses` map to go with `playerHp`'s — so an ally's War Cry or a
landed poison showed on their model (M70.17) but the ally target frame's
own status-pip row, the one panel built to summarise a selected target's
condition, stayed empty; the monster branch two cases up gets a full pip
row from the identical `STATUSES[id]` lookup. Added `playerStatuses`
(same shape and lifecycle as `playerHp`), passed `hp`/`maxHp` into the
player nameplate call, passed `statuses` into the ally branch's `look`.
Verified live: synced a synthetic remote player with `hp: 27, maxHp: 50`
and a burning status in one uninterrupted call (spread across an awaited
gap, the live server's own real sync would purge a synthetic id not in
its player list before the check ran — same class of race M70.9/M70.10's
tests already learned to avoid), and confirmed `playerHp`/
`playerStatuses` held the real values, the ally frame read "27 / 50",
and its status row showed exactly one pip titled "Burning — Alight, and
it will go on burning without you." `animation.mjs` and `smoke.mjs`
green; `fighting.mjs` failed twice more against cactoro (same
keepAway-kiter limitation noted in M70.16/M70.17) and passed clean on a
third run against mushnub.

**Phase 70 M70.17 — an ally's burn was invisible to everyone but them.**
The bigger of the two candidates the same research pass found, one hop
past M70.9 and M70.13. M70.9 gave burning/poisoned/bleeding/chilled a
real pulse on `Actor.ts` and wired it for the local player's own body and
for every monster — but `STATUS_UPDATE`, the message that carries a
status, is sent to exactly one socket (`sendStatuses`), the entity it is
running on. A War Cry cast on a party-mate, or a monster's poison landing
on them, was invisible to everyone standing next to them: the caster who
just buffed an ally had no way to see it take, and the four setters M70.9
built had no data to draw with even if a remote body had asked for it —
the identical shape of gap M70.13 already found and fixed once for HP.
`PlayerState` gains `statuses`, same `{ id, endsAt }[]` shape
`MonsterState` has carried since the target frame existed, merged in at
broadcast time from the same `statusesOf()` the player's own
`STATUS_UPDATE` already reads — not a new source of truth, just the
existing one finally reaching everyone else's screen. Client's
`syncPlayers` gained the exact four calls monsters and the local player
already get. Verified live: drove the real `syncPlayers()` path with a
synthetic `PlayerState` carrying a poisoned status and confirmed the
resulting remote `Actor`'s `poisoned` flag set correctly while the other
three stayed false; separately confirmed over a raw socket that
`statuses` is now a real (well-typed, currently-empty) array on every
`PlayerState` in the broadcast. `animation.mjs`, `smoke.mjs` and
`statuses.mjs` green; `fighting.mjs` failed against cactoro again (the
same keepAway-kiter test-bot limitation from M70.16, unrelated) and
passed clean against mushnub.

**Phase 70 M70.16 — the badge that was already named after itself.** A
fresh research pass into areas untouched this session (leaderboard, day/
night, talents, crafting beyond materials) found `SkillPanel.ts`'s own
`unspentPoints()` function, exported with a doc comment reading "used by
the HUD badge, which has no reason to know about the panel" — and never
once called anywhere. The sibling it describes already exists: the
attribute panel's dock icon has carried a real badge for an unspent stat
point since before this session started. The skills dock icon, one
button over, had the identical unspent-currency shape (a talent point
sitting unused until the player happens to open K) and no badge at all.
Wired a `dock-skills-badge` span (same markup, same generic `.dock-badge`/
`.show` CSS the character badge already uses) and drove it from
`SkillPanel.setProgress`, which already receives `pointsAvailable` on
every `WEAPON_PROGRESS` message — the exact same number
`talentPointsAtLevel(level) - spentTalentPoints(weapon, ranks)` computes,
already delivered over the wire, making the unused helper function
genuinely redundant rather than merely unfinished. Deleted it rather than
leaving two parallel ways to compute one number. Verified live: a fresh
level-1 character's badge read "1" and was visible (a fresh character
does start with a real unspent point), and forcing `pointsAvailable: 0`
through the same method confirmed the badge correctly hides again.
`animation.mjs`, `smoke.mjs` and `talents.mjs` green; `fighting.mjs`
failed twice specifically against cactoro (a keepAway kiter this simple
test bot struggles to close melee range on — unrelated to a change that
touches only static HTML and a UI panel class) and passed clean against
mushnub.

**Phase 70 M70.15 — a mark for whoever has work.** The last of the three
candidates the broader research pass found, the one flagged as weaker
justification and worth a second look before committing — it survived the
look. `dialogueActionsFor` already derives, every time the dialogue box
opens, exactly which quests an NPC has and whether each is offerable,
in-progress, ready to turn in, locked or done; nothing said any of that
before the box was open, so the only way to learn a quest-giver had
something for you was to walk up and ask, every single time, giver after
giver. The precedent this generalizes is the attribute panel's own dock
badge — an unspent stat point gets a passive nudge on the relevant menu
icon rather than making a player open the panel to notice — applied to
its most natural sibling, a quest giver's own head. `PlateSpec` gains
`hasQuest?: boolean`, computed once per NPC per frame from the exact same
`questsFrom`/`offerStateFor` pair `dialogueActionsFor` already calls, true
only for "offer" or "ready" (a new quest to take, or a finished one
waiting on a reward) — never "locked" (nothing to do yet) or "in-progress"
(already showing on the tracker). A small gold "!" on the nameplate, gold
rather than the "hunting" marker's red from M70.10, since this is an
invitation and not a threat — the same gold this game already uses for
quest rewards and the level-up toast. Verified live: intercepted the real
per-frame `drawPlates()` call to `hud.plate()` for every NPC on a fresh
level-1 character and confirmed Warden Cabel (gives "Thin Them Out",
level-1 kill quest) and Marda Quill (gives "The Fire Wants Feeding", a
level-1 gathering quest with no combat objective, so not the one that
would have been guessed first) both read `hasQuest: true`, while the
other three NPCs correctly read `false`. `animation.mjs`, `smoke.mjs` and
`quests.mjs` green; `fighting.mjs` clean.

**Phase 70 M70.14 — a stride that kept restarting.** Reported directly
and bluntly: running while attacking sometimes slides — "doing Michael
Jackson." The comment already sitting on this exact code path had solved
half of this bug once before: "auto-attacks fire while you are moving,
the attack clip is around a second long, and for that whole second the
model held a planted swing pose while the character kept travelling" —
fixed by having movement cancel a busy one-shot rather than wait it out.
What that fix never addressed is HOW run resumes once cancelled: `play()`
calls `next.reset()` unconditionally before switching clips, and
`reset()` zeroes an `AnimationAction`'s own clip-local time — so every
single attack that interrupted a run, however briefly, snapped the run
cycle back to the very start of its stride the instant it resumed. The
character's actual position never paused — movement is driven entirely
by input, independent of the animation mixer — so the legs restarting
from a dead stop while the body kept gliding at full, unbroken speed
underneath them is the moonwalk, exactly and literally. `AnimationMixer`
keeps advancing every action's own internal clock even while its weight
is faded to zero mid-crossfade, which is what made the fix a one-line
subtraction rather than a new clock to build: skip the `reset()` call
specifically for "run," and a resumed stride simply continues from
wherever it naturally already was. Verified live by reading the actual
`AnimationAction.time` value across a real interruption: it advanced
normally before an attack, kept advancing through it, and read the exact
same value immediately on resume that it held mid-attack — proof the
reset no longer fires, not an inference from watching the model.
`animation.mjs` and `smoke.mjs` green; `fighting.mjs` clean.

**Phase 70 M70.13 — an ally was harder to read than a monster.** The
larger of the two remaining research candidates. The target frame's own
code admitted the gap in a comment: "remote players' HP is not on the
wire, so the frame shows the name and says what the selection is for,
rather than inventing a health bar." `MonsterState` has carried real
`hp`/`maxHp` since the target frame existed; a party-mate being harder to
read than a monster was never a design choice, just the one broadcast
that never reached them — and the game already has skills built
specifically to aim at an ally (Mend, War Cry) with no way to tell whether
one needed the heal or whether it landed. `PlayerState` gains `hp`/`maxHp`,
merged in at broadcast time from `hpBalances`/`maxHpOf` — the exact same
pattern already used for `weaponRarity`/`armorRarity`, which `LivePlayer`'s
own `Omit<PlayerState, ...>` line was clearly written to generalize to
(it already listed keys that did not exist on `PlayerState` yet). Client
gained a `playerHp` map, same shape as the existing `playerNames`/
`playerClasses` per-remote-player maps, fed from `syncPlayers` and read by
the one call site that used to hardcode `0, 0` — `TargetFrame.show`
already handled real numbers correctly the moment they arrived, since
`maxHp > 0` was always its own "known" check. Verified live over two real
browser sessions: logged in two characters, walked one next to the other,
selected the second as an ally target on the first, and confirmed the
target frame showed a real, visible "60 / 60" health bar rather than the
old hidden/hardcoded state. `animation.mjs` and `smoke.mjs` green;
`fighting.mjs` flaked on its usual unrelated accuracy-roll noise (this
time against armabee) and passed clean on re-run — this change adds a
wire field and never touches combat resolution.

**Phase 70 M70.12 — the forge's other output got no acknowledgement
either.** Broadened back out from monster AI/combat after two dedicated
research passes confirmed that vein was well-covered; this is the
smallest and cleanest of three candidates the follow-up research found.
`onMaterials`'s own comment already earns its keep for essence — "the one
material with no gathering animation and no node to stand at... so it is
the one that most needs saying" — but Ingot and Wardweave arrive through
this EXACT SAME message (`REFINE_MATERIAL` mints them at the smithy) and
got nothing: no floater, no acknowledgement, the identical "reward with no
feedback" gap M70.1 fixed for wood/ore/herb, one verb over — a refine can
mint up to 50 of either in a single click and the wallet just quietly
changed. Extended the same diff-against-`walletSeen` pattern essence
already used to both refined materials, each with its own colour
(`#c7d0da` for ingot, `#c9935a` for wardweave — distinct from ore's duller
grey and herb's green, since a refined material is meant to read as
levelled-up from its raw ingredient). Reads the real delta rather than
assuming +1, for the same reason essence's own comment gives. Verified
live: called the actual `GameSocket` dispatch path (`socket.handlers.
onMaterials`, not a reimplementation of the logic) with a synthetic
message jumping ingot by 3 and weave by 2 in one shot, confirmed both
floaters read exactly `+3 ingot`/`+2 wardweave`, confirmed a no-change
follow-up message spawned nothing, and confirmed the wallet balances
themselves updated correctly. `animation.mjs`, `smoke.mjs` and `items.mjs`
green; `fighting.mjs` flaked on its usual unrelated retreat-check noise
and passed clean on re-run — this change touches only a client message
handler with zero server interaction.

**Phase 70 M70.11 — a shot fired from where you WERE facing.** Reported
directly, and it survived M63.1's own fix for the neighbouring bug: a
ranged attack fired while turning to face a target visibly launched from
behind the character rather than in front of it — "firing backwards" while
running. The cause was one frame of lag between two things that looked
simultaneous. `onBattleResult` forces the player to face whatever they
just hit (`faceToward`) and, on the very next line, reads the muzzle
bone's world position to spawn the shot (`launchAttack` → `muzzlePosition`)
— but `faceToward` only ever set a TARGET angle; the actual turn is eased
over several frames at `turnRate = 14` (`Actor.ts`'s `update`). Reading the
muzzle bone synchronously, in the same tick the target angle was just
set, caught it still oriented wherever the character had been facing a
moment before — which, backing away from a fight, is directly away from
where the arrow needed to go. `Actor.faceToward` gained an `instant`
parameter that applies the new facing to the bone THIS frame rather than
easing into it, used only by `onBattleResult`'s snap (every other caller —
a wandering monster's idle glance, the player's own body easing to face
whatever it's circling — keeps the smooth turn, which is what makes normal
movement not look like a turret). Verified live: reproduced the exact
scenario at the `Actor` level — faced away, then read the muzzle position
with and without `instant` — and confirmed the non-instant read stayed on
the stale "away" side in the same tick (the bug, reproduced on demand)
while the instant read immediately reflected the new forward-facing
orientation. `animation.mjs` and `smoke.mjs` green; `fighting.mjs` flaked
once (an unrelated "still swinging while retreating" false positive) and
passed clean on four of five runs — this fix touches only client files,
and `fighting.mjs` connects over a raw socket with no client dependency at
all, so it structurally cannot have been caused by this change.

**Phase 70 M70.10 — which of these is coming for ME.** Requested directly:
multi-monster combat, and continued monster AI. The melee ring queue
(Phase 42) already made a pack of attackers spatially readable — only
`MAX_MELEE_ATTACKERS` press to contact, the rest orbit a wider ring waiting
their turn — but nothing ever answered the question a pack fight next to
an ally actually asks: which of these bodies is hunting me, and which is
hunting them? The server's AI has known the answer since the state machine
was written (`ai.targetId`, read every tick to decide who a monster is
chasing) and never said so. `MonsterState` gains `targetId: string | null`
— a raw id rather than a boolean like `windingUp`/`fleeing`, because this
is genuinely per-monster information neither client can derive alone — and
the client turns it into a small warning glyph on a monster's own
nameplate the instant `targetId` matches the local player, distinct from
`engaged`/`locked` (the player's own choice of who to fight) because this
is the monster's choice, and the two can disagree. Paired with a
readability fix on the other side of the same problem: the combat log
printed one raw "The X hits you for N" per swing, and since each monster
runs its own independent `attackIntervalMs` (no shared clock), a real pack
scrolled itself out of the visible window before a player could read any
one line — the exact problem `floaters.ts` already solved for the floating
numbers, never given to the log. `CombatLog.pushHit` now collapses hits
landing within 400ms into one growing line, keyed generically rather than
per-attacker (a per-monster key would almost never merge anything, since
attack intervals run 1.4-3s — the actual overlap is BETWEEN different
monsters' independent timers landing close together, not one monster
hitting twice fast) and dropping the attacker's name past the first hit,
since attributing a merged group to whichever one started it would
misattribute every hit after it. Crits stay their own line always,
un-mergeable, so a genuinely notable hit is never buried inside a count.
Verified live: sampled the AI's real `targetId` over a socket and confirmed
it flips to the approaching player's own id the instant the monster picks
them up; drove `pushHit` with three different monster labels back-to-back
and confirmed they collapsed into one "Hit 3 times for 9" line while a
crit and an unrelated log line each still got their own. (First attempt at
the log test used artificial `setTimeout` gaps between calls and failed —
not a bug, headless Chromium's timer throttling in this session's
background tab makes a nominal `setTimeout(60)` an unreliable stand-in for
a real 60ms gap even though `performance.now()` keeps accurate wall-clock
time regardless, the same throttling class documented back in the M70.5
freeze-fix verification. Fixed by removing the artificial delay entirely —
back-to-back calls are the more faithful simulation anyway, since real
`MONSTER_ATTACK` messages arrive through the same handler in quick
succession, not deliberately paced.) `animation.mjs`, `smoke.mjs` and
`fighting.mjs` all green.

**Phase 70 M70.9 — a poisoned body was wearing Frost Nova's colour.** Not
a missing feature this time but an actively wrong one: `setChilled`'s own
comment said "Frost Nova AND Poison Arrow both slow; the blue is what says
it worked" — and the monster call site backed that up, driven off
`s.slowed`, a generic flag true for anything with `moveMultiplier` under 1
(chilled, poisoned, staggered, all three). A poisoned cactoro victim, and
even a staggered troll mid-recovery-window, glowed the exact blue meant to
tell a player their Frost Nova had landed — the wrong lesson, every time
one of the other two statuses was actually the one running. `setBurning`
already wrote down the fix for the general case back in M69.16: "a
damage-over-time effect is the one kind of condition where 'something is
actively happening to me right now' is worth its own pulse rather than
sharing the steady tint a plain slow gets" — poison is a DOT (`dot: {
damage: 4, school: "nature" }`) exactly like burning is, and bleeding
(`dot: { damage: 5, school: "physical" }`, applied by Rend) turned out to
be a second DOT with no visual at all, caught by the same pass. Added
`setPoisoned`/`setBleeding` to `Actor.ts`, same pulse shape as `setBurning`
with their own channel (green for poison, a duller red than burn's for
bleeding, so a burning body and a bleeding one are never mistaken), and
fixed the monster call site to read the real `chilled` status id instead
of the borrowed `slowed` flag — chill now means chill, and nothing else
gets to wear its colour. Both directions wired: a player's own poison/
bleed now shows on their own body (mirroring M69.16's player-side burn/
chill extension), and every kind that can inflict either — cactoro's
poison, Rend's bleed on a monster — reads correctly. Verified live:
sampled the actual `MeshStandardMaterial.emissive` hex under each of the
four states in isolation and confirmed chilled held its original
`0x2f6fa8`, and burning/poisoned/bleeding each produced a distinct,
non-zero colour rather than collapsing onto chill's blue or each other.
`animation.mjs`, `smoke.mjs`, `statuses.mjs` and `fighting.mjs` all green
(one `fighting.mjs` run failed on pure accuracy-roll variance against a
mushnub, passed clean on immediate re-run — this change touches only
client-side emissive colour, nothing in combat resolution).

**Phase 70 M70.8 — cowardice, made literal.** Back to monster AI after the
lag detour. A goblin was never written as a solo threat: its whole answer
to a real fight is `alertRadiusPx`, calling the camp rather than standing
alone. A kind built entirely around "I am not doing this by myself" is
exactly the kind that breaks and runs once it actually is by itself and
losing — so below a fifth of its own HP, a goblin now turns on whoever hurt
it and flees rather than trading the last few blows. New `MonsterAiState`
value `"flee"`, entered from `chase` the instant HP crosses the line (not
diagnosed on a later tick — the same immediacy the wind-up check already
had), exited back to `return` (walk home, heal, same as giving up a chase)
once the threat is lost or outrun past `MONSTER_FORGET_PX`. Runs a little
faster than its ordinary chase speed (`fleeSpeedMultiplier: 1.35`) — enough
that disengaging even slightly lets it put real distance down, not so much
that a player who keeps pressing can't still finish it. `fleeing` is a new
`MonsterState` field, same shape as `windingUp`/`leaping`/`alerted`: derived
fresh from the AI state every tick rather than tracked as its own timer, so
it can never survive a death or a walk home stuck `true`. Considered
demon and troll for the same treatment — the research that found this gap
suggested them — and deliberately left both alone: demon's own comment
calls it "the troll's damage WITHOUT THE TELL," already the
always-at-full-aggression archetype, and neither kind's text says anything
about breaking when hurt the way the goblin's shout already does. The rule
from M70.4 held: a mechanic has to be arguable from a kind's own line, not
handed to whichever kind was next in the research report. Verified live
over a real socket: pressed a goblin from 35 HP down, watched it announce
`fleeing: true` on the exact tick it crossed 7 HP (20%), and confirmed it
covered a real 420px running from its attacker before a relentlessly
pursuing player caught and finished it — exactly the "helps, does not
guarantee" design. `animation.mjs`, `smoke.mjs` and `fighting.mjs` all
green.

**Phase 70 M70.7 — a camp is not one monster.** M70.6 fixed the GPU-side
half of the reported lag; this is the CPU-side half, the other symptom
from the same report — stepping out of the beginner town. Every monster's
`Actor` was built the instant it entered `MONSTER_SPAWN_RADIUS_PX`
(1150px), synchronously, inline in `syncMonsters` — fine for one monster
wandering into range, but walking past the town gate can bring an entire
camp into range on the very same server snapshot, and if those models are
already cached (they usually are — the same few kinds repeat across
camps), every one of those `actor.load()` promises resolves in the same
microtask flush, paying its clone-the-skeleton, rebuild-the-mixer,
rebind-six-clips cost for a dozen-plus monsters back to back in one JS
turn before the browser gets to paint. Fixed with a spawn queue: a newly
in-range monster is queued rather than built immediately, and
`processMonsterSpawnQueue` — called once per rendered frame — builds at
most 3 of them, so the same total cost lands across several frames
instead of one. Position is still set the instant the actor is built
(`setTargetPosition` snaps on its first call, no glide), so nothing pops
in at the scene origin waiting for its first snapshot. Verified live:
queued 24 fake monsters as one batch and confirmed via `requestAnimationFrame`
sampling that exactly 3 built per frame, all 24 were eventually built with
none left stuck at the origin, and the queue fully drained — with zero
console errors. `animation.mjs`, `smoke.mjs` and `fighting.mjs` all green.

**Phase 70 M70.6 — a light that never left.** Reported right after M70.5:
the game still lags sometimes, on stepping out of the beginner town and on
attacking. This one was GPU-side rather than JS-side, and much less
visible from the code than a missing catch block — every bolt, wand beam
and elemental skill flash carried its own `new THREE.PointLight()`, added
to the scene when it fired and removed when it expired. Adding or removing
a light changes the light count the renderer bakes into every lit
material's shader program at compile time, and any material that has
never been compiled for that exact count before pays a real GPU stall on
its next frame — for every lit character, monster and building in view,
not just the light's own. With several players and monsters able to be
mid-attack at once, that count was different on practically every frame,
so the stall never really stopped happening, and combat is exactly when a
light is most likely to appear or disappear. Fixed with a `LightPool`
(new `client/src/three/lightPool.ts`): sixteen `PointLight`s added to the
scene once at startup, "off" is intensity 0 rather than removed, and
`bolt()`/`beam()`/`flash()` now borrow and return one instead of creating
their own — the light count the renderer sees never changes again after
the first frame. A pool that's briefly exhausted degrades to "no light on
this one" for a bolt, or a short queue for a skill flash, rather than ever
falling back to `new THREE.PointLight()`. Caught one real bug building
this: a released light stayed parented under the per-effect Group it
arrived in, so once that group was removed from the scene on expiry the
light went with it even though only its reference came back to the
free list — the pool silently shrank by one every time a bolt or flash
finished, which a naive test masked by only checking the total light
count against a guess rather than the pool's own tagged lights. Fixed by
re-parenting onto the scene root in `release()`. Verified live: fired 36
simultaneous bolts, beams and flashes and confirmed via the pool's own
tagged lights that the in-scene count never exceeded 16 during the burst
and returned to exactly 16 afterward, with zero console/page errors.
`animation.mjs` and `smoke.mjs` still green; `fighting.mjs` failed once
against a ghost with the standing-still Fighter dealing 0 damage — a
pre-existing matchup flake documented back in M69.11 (this test is a pure
raw-socket server test with no dependency on any client file), not a
regression from this change.

**Phase 70 M70.5 — one bad frame, not the rest of the session.** Reported:
the game sometimes freezes completely mid-fight, and it was happening
before this session's own recent work, which ruled out any single recent
change as the cause. The real bug was structural and much older: `loop()`
was a ~150-line `requestAnimationFrame` callback that reaches into a couple
dozen subsystems and iterates Maps combat is constantly mutating underneath
it — a monster dying and being removed mid-frame, an actor whose model
hasn't finished loading — and its own `requestAnimationFrame(this.loop)`
reschedule was its very last statement, with nothing catching what came
before it. One uncaught exception anywhere in that function, on any frame,
and the reschedule never ran: rendering stopped forever, with no crash and
no error a player could see. Combat is exactly when the most state changes
under the loop's feet, which is why it always looked like an attacking
freeze. Fixed by splitting the callback into a thin `loop()` that wraps a
call to the unchanged logic (now `loopBody()`) in `try`/`catch`/`finally`,
so `requestAnimationFrame(this.loop)` always fires no matter what throws
inside. This doesn't diagnose which specific exception was the original
trigger — it guarantees that whichever one it was (or the next one, from
code not yet written) costs exactly one skipped frame instead of the rest
of the session. Verified live: a Playwright session injected a real
exception into a frame-loop call and confirmed via three.js's own
`renderer.info.render.frame` counter (movement-independent, unlike an
earlier attempt that mistakenly used player position) that frames kept
advancing at the same rate before and after, with the console showing the
exception caught and logged exactly once. Full offline suite
(`animation.mjs`, `smoke.mjs`, `fighting.mjs`) still green.

**Phase 70 M70.4 — a body behind it, made literal.** The orc brute's own
line has read "a body behind it" since it was written, and until now that
was a comment nobody could feel — every blow it landed was the same
ordinary swing every band-3 melee kind throws. It telegraphs a slam now,
the first below band 4: `windupMs`/`slamRadiusPx`/`slamDamageMultiplier`
are new data flowing through machinery M69.4-M68.2 already built and
proved — the client's stretched-swing animation, the danger ring, and
`balance.mjs`'s own acceptance bar (standing in it must cost at least 15%
of a health bar, dodging it must save at least 10 points) all read these
fields generically, with zero new code written anywhere. The multiplier
was SOLVED against that bar, not picked: a first guess of 5.2 (scaled
naively off troll's own number) put orc brute's stood-in cost at 78% and
made band 3 unwinnable 35% of the time — measuring rather than guessing is
what caught that before it shipped. Re-solved to 2.0, it lands at 26% of a
health bar, between golem's 30 and troll's 33, with the full suite passing
clean. Demon was deliberately left alone: its own comment calls it "the
troll's damage WITHOUT THE TELL," a stated contrast a telegraph would
erase. Cactoro, goblin and ghost were passed over too — keepAway,
the shout, and evasion are each already that kind's own answer to
positioning, and a telegraph would be a second trick stacked on a kind that
already has one. Verified live: `windingUp: true` observed on a real orc
brute mid-fight, and `tools/test/fighting.mjs`'s own generically-derived
list now reads "troll, orcbrute, golem, dragon" with no code changed to
produce that line.

**Phase 70 M70.3 — a haunt is not one ghost.** Ghost now has
`alertRadiusPx` (260px, anchored to `AGGRO_RANGE_PX` rather than either
humanoid's own number, since neither goblin's 210 nor orcbrute's 300 was
chosen for a reason that transfers), matching the social-aggro shout
goblin and orcbrute already have. Not a fix for a stated promise — nothing
in ghost's own text claims a shout — but a small, low-risk, thematically
consistent addition: undead answering the same "does this kind rouse its
own" question every other social kind already answers, at the cost of one
stat field with no new balance numbers to solve.

**Phase 70 M70.2 — a corpse dies where it fell, not where it will respawn.**
Reported from play: killing a monster teleported the corpse to its spawn
point and only THEN played the death animation. `killMonster` set
`monster.x/y = ai.home` in the same tick it set `status: "dead"`, so the
very next snapshot carried the dead flag alongside a position already
reset — the client's death-edge handler had nothing but the wrong place to
play `die` in. The reset was never wrong as GAMEPLAY bookkeeping — nothing
about a dead monster's position matters while it is dead, since every AI
and collision pass already skips non-alive monsters — it was wrong as a
RENDER instruction, conflating "where the next spawn should stand" with
"where the client should draw the corpse right now." Moved to the respawn
tick, the one moment the position actually starts mattering again: a corpse
now sits at the real kill spot for the whole dead interval and only jumps
home in the same tick `status` flips back to `"alive"`, arriving already
in place the instant something is there to see. `resolveDeathBurst` already
read the death-spot position correctly (M69.6's own comment noted it fires
"before the body is sent back to its spawn point below") — only the
position broadcast itself was late to the same insight. Verified live: drug
a monster 374px from its post before finishing it off, and the first
snapshot carrying `status: "dead"` placed it 374px from home and 34px from
the actual kill spot — previously that same snapshot would have shown it
already at home. Two existing offline suites (`throwers.mjs`, `camps.mjs`)
were checked and confirmed unaffected: both already discard any monster
observation that isn't `"alive"`, so neither ever measured the moment this
bug lived in.

**Phase 70 M70.1 — the reward with no acknowledgement was the one every
player pulls first.** Combat's own version of this had been worked
milestone by milestone through Phase 69 (a hit, a crit, a kill all say so
now); the same gap sat one system over, in the loop that predates all of
it. Wood, ore and herb — the gathering that opens the game before a
character has fought anything — updated the wallet and nothing else: no
floater, no sound, while essence, runes and recipes all earned a "+N"
acknowledgement earlier this session. `"gather"` has been a real,
mixed, preloaded sound cue since Phase 39 with no caller anywhere in the
client — the same shape as `fx.png`'s dead rows, this time in audio. Three
"seen" flags (one per message, since wood/ore/herb do not all land in the
same breath on connect) gate a diff against the wallet's own previous
value, reusing the exact floater/sfx call the essence fix already proved.
Quest completion got the same treatment and needed it more: turning a quest
in is a story beat and a reward at once, and it was the one moment in this
whole loop with NO acknowledgement beyond the tracker panel quietly losing
a row — smaller rewards (a rune, a recipe) already had one. A newly-appeared
id in `QUEST_STATE`'s resent `completed` list now gets the quest's own name
in a floater and a toast, plus the same sound the level-up banner uses.
Verified: typecheck and both the animation and quests offline suites pass;
live checks confirm `gather.wav` actually serves and that `QUEST_STATE`
always sends a real array, never undefined, so the new diff logic cannot
throw on a fresh connection.

**Phase 69 — everyone's legendary gear glows, not only your own.** M69.19
answered "do that for other players?" — asked one message after M69.18
shipped, and correctly, since a flex nobody else can see is not much of a
flex. `Appearance` turned out to already carry everything needed: it is the
single broadcast shape both the local player and every remote player have
always dressed their rig from, and it already gives a rarity to every slot
that can glow (`weaponRarity`, `offhandRarity`, and a rarity per entry in
`layers` for cape/armor/helm/boots) — nothing new had to reach the wire. The
per-actor timer that used to be one number is a map keyed by player id now
(`"__local__"` for the player), so two people standing together in enchanted
gear do not fight over a shared clock or sync their sparkle to the same
tick. `playerAppearances` is a new small map retaining each remote player's
last `Appearance` — `setAppearance` consumes and applies it immediately but
never kept a copy, and the aura has to re-ask "what is this player wearing"
every tick, not only on the frame a snapshot happened to arrive — cleaned up
on disconnect alongside the actor itself. Verified: typecheck and the
offline animation suite pass; a live two-client connectivity pass confirmed
both players see each other and populate `playerAppearances` with no runtime
errors across the session.

**Phase 69 — a legendary set keeps saying so once you're wearing it.** M69.18,
the second half of "what would be cool for an MMORPG": `RarityDef.glow` has
tinted the top two rarities' equipped mesh with an emissive lift since the
field existed, which says "this is special" while standing still and stops
saying anything the moment you start fighting in it. Every glowing piece
worn — not only the weapon — now sheds a slow ambient wisp, cycling between
whichever glowing slots are actually filled. The obvious first cut read only
`weaponRarity`, and asking "the same for all the items?" mid-build was the
right catch: `weaponRarity`/`armorRarity`/`bootsRarity` are three fields the
server sends for their own GAMEPLAY bonuses (crit damage, XP, move speed),
never a complete answer to "what is glowing" — a ring or a cape carries no
bonus off its rarity and so has no field of its own, but glows on the mesh
exactly the same as a weapon does. Reading `this.items` directly instead
covers all seven slots for free, and a fully-enchanted character now sparkles
FASTER than someone wearing one glowing ring, the same way the emissive lift
already stacks piece by piece.
Deliberately NOT the same machinery a real hit uses: `Projectiles.wisp` is a
new, lighter sibling of `bolt` — one small drifting sprite, no point light,
no trail cone — because gear flashing like a crit every third of a second
would read as broken rather than ambient. Staggered on a random beat (faster
with more glowing pieces, floored so a full set never becomes a strobe),
tinted per-piece from the same `RarityDef.color` the item's own name and
nameplate already use. Local player only for now — extending it to other
players' gear is a small follow-up (their per-slot rarity isn't tracked
client-side) rather than something this milestone needed to solve. Verified
live twice: an oversized single-piece test rendered as a clean glow in the
item's own colour, and a three-slot rig (weapon/helm/boots glowing, armor
deliberately not) held a small steady live-projectile count across many
spawn cycles with the non-glowing piece correctly excluded — cleanup keeps
pace with the spawn rate rather than leaking.

**Phase 69 — a Frostbrand swings the same white arc a plain sword does.**
M69.17, improvised rather than reported: Phase 62 gave every weapon family a
real elemental identity — a fire axe, a frost bow, five schools each with a
weapon that deals them — and asked "what would be cool for an MMORPG" turned
up that identity stopping exactly at the damage number. `style.tint`, the
colour behind every ordinary swing's arc and every bolt or beam a staff or
wand throws, is keyed by WEAPON FAMILY alone; `p.school` — already on the
wire, already colouring the floating number and the log line — had never
once reached the burst, the bolt, or the beam. A Frostbrand's swing painted
the identical warm-white arc a plain sword's does; a fire staff's bolt flew
the same generic blue every staff's does. `elementTint` reads the actual
school dealt and falls back to the weapon's own tint only for plain physical
hits, reaching the impact burst, the projectile in flight, and the wand's
beam in one pass — the same three places M69.9-M69.12 already touched, this
time carrying the right colour instead of a fixed one. Verified live: the
exact frost hex the new code computes rendered as a clean ice-blue slash arc.

**Phase 69 — the body you are looking at never told you it was burning.**
M69.16: `setChilled` and `setRecovering` have been MONSTER-ONLY calls since
either existed — Frost Nova has tinted a slowed monster blue since Phase 64,
and nothing ever told the PLAYER's own actor it was chilled, let alone
burning. The only place a player ever saw their own conditions was the HUD
status bar; the character on screen looked identical whether they were
clean or three ticks into a burn. A new `setBurning` extends the same
priority chain `recovering`'s amber pulse already established — a DOT
pulses, because the whole content of the signal is "still ticking", a plain
slow stays steady — and both `chilled` and `burning` now read off the
player's own `STATUS_UPDATE` the same way the HUD bar already does, plus a
one-line addition giving monsters the same burn pulse `slowed` already gave
them for chill. Verified live: a burning character glows visibly hot red
across their whole body.

**Phase 69 — the moment a crit is worth gets a real sparkle.** M69.15: every
hit already paints its `fx.png` atlas burst; a crit only ever scaled that
same flat frame up. The point of impact now also gets a genuine particle
flourish — the exact `bolt()` call a staff's missile and the wand's muzzle
flash already use, spawned stationary at the hit rather than travelling, so
the same soft glow and real light this session gave projectiles now marks
the single loudest moment of an ordinary swing too. Gold for the player's
own outgoing crit, matching the gold number and gold self-flash already
established; red for a monster's crit landing on the player, matching the
rule that incoming damage keeps its red regardless of school. Crit-only on
purpose — every hit already gets a burst, and a sparkle on all of them would
be noise where it is meant to be a landmark. Verified live.

**Phase 69 — a boss dying is not the same moment as a slime dying.** M69.14:
`guaranteedDrop` already decides the framed nameplate and the target frame's
elite border — "the three things with a guaranteed drop are what a player
walks a long way to find" — and the kill itself, the one moment those two
readouts have spent the whole fight pointing toward, played the identical
burst either way. A troll's death now gets a bigger, longer burst, a real
screen shake (nothing shook on a kill before this — only crits mid-fight
did), and its own combat-log line and colour. Ordinary kills are untouched.

**Phase 69 — a crit is a fact about the swing, not only about what it hit.**
M69.13: every other signal a crit produces — the gold number, the bigger
burst, the screen shake — lands on the target or the screen, and the one
body that never showed anything for LANDING one was the player's own. Landing
a crit and missing one looked, felt and read identically from the swinging
character's own point of view; the only place "that was a crit" showed up
was somewhere else on screen. The player's own body now takes the same gold
flash the target already gets, on the same edge. A small, deliberately
narrow fix — the mirror case (being crit BY a monster) already differentiates
via a bigger burst and its own shake, so nothing there was missing.

**Phase 69 — the wand has a muzzle now.** M69.12: the beam was the one
delivery style M69.9's texture pass left untouched, and it had a real gap of
its own — a zap simply appearing between two points with nothing marking
where it left from. Rather than inventing a fifth visual system, the wand's
`beam()` now opens with a call to the SAME `bolt()` a staff already throws —
a near-zero-length flight (0.06 units, just enough to avoid a degenerate
`lookAt`) that plants the proven spark/glow/light combination at the source
for a beat before the zap itself draws. No new geometry, no new material, no
new texture: the muzzle flash is a bolt that barely moves. Confirmed live —
a soft tinted glow now sits at the beam's origin alongside the bright core.

**Phase 69 — slower, on request, and not the number that matters.** M69.11
answered "all attacks in general need to be a little slower" by touching
exactly one kind of number: how long the beat between a swing or shot
starting and its damage landing takes to read — `swingMs` per melee weapon,
`speedPxPerSec` for a bow's arrow and a staff's bolt, and the matching
constants on the monster side (`IMPACT_DELAY_MS`, a thrower's own flight
speed). Every one of these was already visual-only before this milestone —
`impactDelayMs` decides when the impact FX and the number appear, never how
often a swing can happen — so slowing them by roughly a fifth to a quarter
across the board makes combat read with more follow-through without moving a
single DPS number the Phase 68 balance sweep solved for. Confirmed by reading
the live constants back out of the built source rather than trusting the
diff. A live suite (`fighting.mjs`) failed during verification in a way
traced to a pre-existing, unrelated cause: it is a raw-socket test with no
dependency on any file this milestone touched, and the specific persisted
test character it re-used happened to have a low hit chance against the
high-evasion ghost it was standing next to — reproducible, but structurally
incapable of being caused by a client-only visual-timing change.

**Phase 69 — the mark is a rune circle now, not a plain ring.** M69.10 spent
the fourth particle frame M69.9 downloaded but left reserved: `ring.png`, a
Kenney rune circle, mapped onto the exact `RingGeometry` `skillfx.ts`'s
`mark()` already draws for eight skills (Gut Punch, Concuss, Stagger, Expose,
Hunter's Mark and the three readers' self/target rings). Checked rather than
assumed — `RingGeometry`'s own UV attribute is a plain `u = x/outerRadius/2 +
0.5` square projection, verified by constructing one in Node and printing its
vertices, which is exactly the convention the texture was authored for, so no
new UVs were needed. `nova` and the rest keep their flat fill on purpose: a
rune circle on Earthshatter, a physical shockwave with no school of its own,
would be describing something the skill does not have — the same "a shared
signature is a vocabulary, not a uniform" call this file already has on
record for Rend's cone. Verified live that the textured material renders and
carries colour (a character standing inside one tinted visibly toward the
mark's own hue); a fully clean isolated shot of the shape was not obtained —
the test camera's override kept losing the fight with the game's own
per-frame follow logic, a rig problem rather than a code one, and is recorded
here rather than glossed over.

**Phase 69 — a bolt that glows instead of a ball that is lit.** M69.9,
reported from play: *"the projectile animations and effects are very
poor."* A bolt's core and glow were spheres, its trail a flat-shaded cone —
real geometry with a real light, which was the right fix for M64.1's "reads
as a smudge" problem, but a radial gradient wrapped onto a sphere's UVs tiles
around it rather than reading as a glow, because a flat gradient only ever
looks like light on something flat facing the viewer. The core and glow are
billboarded sprites now, textured from Kenney's CC0 Particle Pack — a soft
radial burst and a four-point sparkle, four frames kept out of eighty and
downscaled to 128px — layered onto the SAME geometry, light and motion system
rather than replacing them; the arrow's trail took the same texture, rotated
90° at bake time so its gradient runs along the cone's length instead of
around it. A sprite always faces the camera, which is what makes it read as a
glow at every angle, and also means the old trick of spinning the mesh to
vary the silhouette does nothing to it — `SpriteMaterial.rotation` is the
sprite equivalent, an in-plane spin that keeps the camera-facing property
while still visibly turning as it flies. Confirmed live via a headless
Playwright pass: the first several framings showed nothing at all, which
turned out to be the harness (occlusion from a close third-person angle
behind the character's own head, plus additive white glow washing out against
an already torch-lit wall) rather than the code — a top-down camera override
well clear of both settled it, and the bolt reads exactly as intended: a soft
blue glow with a bright core, casting real light on the ground under it.

**Phase 69 — the second swing.** M69.8: Agility's double-attack has resolved
as two fully independent hits since it existed — its own hit/miss/crit roll,
its own combat-log line, its own floating number — and the player's own body
swung once for both of them. `Actor.play`'s own no-op guard, `currentAnim ===
anim`, is exactly what a second `BATTLE_RESULT` arriving mid-clip ran into:
the pose was already `"attack"`, so the clip never reset and a 25%-chance
bonus hit read as an oddly generous number rather than a second swing. Forced
to restart with `play("attack", true)`, which costs nothing on an ordinary
single swing — the transition into `attack` from `idle`/`run` never shared
that guard's branch to begin with, so the fix is free everywhere it isn't
needed and load-bearing exactly where it was silently eating a proc. Verified
live: two `BATTLE_RESULT`s landed 4ms apart, the wire signature of a proc
firing, over a 40-agility character built for it.

**Phase 69 — a shout you can hear.** M69.7: social aggro has flipped every
same-kind packmate within `alertRadiusPx` into `chase` on one hit since the
mechanic was written, and none of it ever reached a client — the only
evidence a player got that a goblin camp had just coordinated against them,
rather than four separate aggro radii being walked into by accident, was
several bodies starting to move at once. An `alerted` boolean now rides the
snapshot, the same shape `windingUp` and `leaping` already use, true for a
1.4s flash on the monster that raised the alarm and on everyone it woke. The
client plays a new cue on the edge — `alert.wav`, synthesised alongside the
other eleven, two quick RISING snarls rather than the falling pitch every
other cue in the game uses for an impact settling, so it cannot be mistaken
for a blow landing — plus a pale flash on the body, reusing the same
`Actor.flash` a hit reaction already uses. Verified live: pulling a goblin
put `alerted: true` on it and brought three packmates up alongside it,
flashing four bodies in the same tick.

**Phase 69 — a corpse that explodes says so.** M69.6: a slime, spiky blob or
cactoro's parting shot has applied real damage from a real radius since it
was written, and drew nothing of its own — the client had no `deathBurst`
code path at all, so a player standing in the blast took a plain hit with no
ring, no colour, no signal that the corpse itself was the source. Worse, the
same `MONSTER_ATTACK` message also fired the ordinary swing animation on a
body that was a tick from playing `die` — a corpse lunging into an attack
pose for one frame before falling over, indistinguishable from a lagged
extra hit. A `deathBurst` flag on the message now suppresses that swing (the
same shape `windupMs` already uses to say "this kind has no ordinary attack
to re-trigger"), and a nova rings out from the body at the moment it dies,
sized to its own `deathBurstRadiusPx` and drawn for every nearby client —
not only whoever took the damage — because a corpse detonating is worth
seeing whether or not you were close enough to feel it. Verified live: a
killed slime sent `deathBurst: true` with its own configured damage.

**Phase 69 — the burst is the whole mechanic, and it finally reads as one.**
M69.5: a wolf and an armabee leap — a real speed multiplier the server has
applied since Phase 66, "the burst is the whole mechanic" in its own comment —
and the client had no way to know it was happening. The run cycle kept playing
at its ordinary per-actor rate while the body covered three times the ground a
normal run would, legs cycling as if nothing had changed underneath them,
which reads as skating rather than lunging. A `leaping` boolean now rides the
monster snapshot, the same shape `windingUp` already used for a wind-up, and
the client drives the SAME run clip at the leap's own speed multiplier for the
burst's own duration — no new art, no new state, just an honest stride. Derived
fresh every tick from the same map the movement code already reads, rather than
set once inside the chase branch, so a monster that leashes home or dies
mid-burst does not carry a stuck `true` into its next several snapshots.

**Phase 69 — a slam you can see coming, from the thing swinging it.** M69.4
found that the wind-up before a troll, golem or dragon's slam — the two-second
gap the whole mechanic is built to be read and stepped out of — showed on
nothing but a ground ring, a cast sfx and a nameplate bar. The creature itself
kept idling or running until the moment of impact, at which point its swing
animation played AFTER the fact: the one body a player is actually looking at
said nothing was happening until it already had. The attack clip now plays
stretched across the real wind-up duration — no new art, the same clip these
three kinds already had, timed to finish exactly as the blow lands rather than
firing all at once at contact. The redundant full-speed replay at impact is
skipped for these three kinds, on the rule this file already has on record:
**a telegraphing creature has no ordinary attack**, so every `MONSTER_ATTACK`
for one of them is the slam whose swing already played.

**Phase 69 — a conditional you can see, skills that look like skills, and a monster that fights back.** M69.3 answered a report that monsters attacked from long range never retaliate, and found two mistakes propping each other up: damage aggroed every PACKMATE of the thing you hit and skipped the thing itself, so aggro reached your actual target only by walking inside its 260px perception radius; and the chase then gave up on anyone past 364px, which is inside the reach of a bow. Perception and pursuit are two questions and had one number between them. `MONSTER_FORGET_PX = 700` now sits beyond every reach in the game, and the leash from home — which was always the right bound on a chase — does the work.

**Phase 69 — a conditional you can see, and skills that look like skills.** M69.2 gave six melee skills a look of their own: every skill paints the school impact burst and so does an ordinary swing, so Gut Punch, Concuss, Stagger, Expose, Backstab and Exploit were things you could not tell you had pressed — including the two that set up the multipliers M69.1 lit the bar for. A mark closes INWARD onto a body, the exact opposite of a nova, meaning "something is being done to this"; a strike is one heavy blow landing. The rule that no melee skill may draw nothing over-reached twice, sweeping in Frost Nova and Rend, which are AREA skills whose shape says where rather than what — a shared signature is asserted as a vocabulary now, not a uniform.

**M69.1 — a conditional you can see.** The deepest skill expression in
the game already existed and was invisible: eight skills READ a status rather
than applying one — Exploit spends Exposed for 140% more damage, Combust spends
Burning, Execute hits 85% harder into any damage-over-time — and the only way to
play them was to remember which wanted which, spot it on a nameplate mid-fight,
and press in time. Press early and a 2.4x resolves as a 1x with nothing to say
so. The hotbar slot lights now, amber and pulsing, when its own condition is met
on you or on what you are actually fighting — the same argument this file already
recorded about the empowered flash, which fires only after you have committed.
It asks `findRead`, the function the server resolves the bonus with, so the light
and the damage cannot disagree. Two rules keep it honest: every reader's
condition must be producible by something in the game, and a self-read must check
you while a target-read checks the target. Verified live by driving real statuses
through the real bar. The mutation for one of those checks passed a bare
`/setConditions\(/` that also matched `noop_setConditions(` — a check that looked
right and was worth nothing.

**Phase 68 M68.1 — can you actually beat the ring you are standing in?** This
game's one rule is that distance from spawn IS difficulty, and in sixty-odd
phases it had been tuned entirely by argument and never once checked. It did not
need to be played through: `resolveHit` is pure, the stat curves are pure, the
catalogue is a table, and a fight is a loop. A twentieth suite builds a plausible
character per band — the level the QUEST TABLE gates that band behind, band gear
at Honed, points where the game's own advice puts them — and fights every
creature four hundred times with each of the seven weapon families. **Every ring
is clearable at the level the game sends you to it, on auto-attack alone**, in
five to twenty-five seconds. It is a MODEL and says so: no skills, no potions, no
crowding, because those are what the player brings, and it measures the floor. It
also says what it cannot know — a thrower does not stand still, so the ranged
numbers are a lower bound — and records that the opening volley is nearly free,
since aggro is 260 and a thrower reaches 210. **Four rulers were wrong before one
number was believable**, each producing output that read as a finding about the
game: two guessed signatures returning NaN (one reported every creature winning
100% of the time against a player on full health), a character reimplemented in a
scratch script with the stat points in the wrong attribute, and one expression
serving two situations — which had an armabee walking away from somebody it was
charging at and failed the creature for a 51-second fight it never had.
**M68.2** then found the real one. A telegraphing creature has NO ordinary
attack — every blow a troll, golem or dragon lands is a wind-up followed by a
slam — so a player who reads them takes nothing at all, and the mechanic's worth
is exactly the cost of ignoring it. That cost was **8% of a health bar on a
troll**: the oldest skill expression in the game was decoration on two of its
three users. Armour subtracts after the multiplier, so a big multiplier on a
small base is eaten — which is why the fix is three different numbers and why the
dragon's is LOWER than the troll's. Solved off a swept curve rather than picked.
**M68.3** then checked that every weapon family is still a weapon — the premise
the game is named for — and the first answer was a 6.9x spread at band 5, a
ranger at ~99 damage a second against a warrior's ~15. The model was spending
every point on the class's damage stat, which gives a swordsman ZERO agility
against the game's own printed advice; following `statAdviceFor` instead took
the spread to 3.4x, and a whole stat-system rebalance was nearly argued from the
difference. That correction also invalidated M68.2's multipliers, which had been
swept against the same too-squishy character — re-solved, standing in every slam
now costs 33%, 30% and 35%.

**Phase 67 M67.1 — the body reacts.** M55.1 pooled twenty-five clips off five
rigs and the game bound six. `Roll` and `PickUp` had been in the library for ten
phases with nothing asking for them, so a dash was a character sliding sideways
in its running pose and taking a thing off the ground was a line in the log. Both
play now — and a roll is the one one-shot that movement may NOT cancel, because a
dash is travel and cancelling on the movement it causes shows the clip for a
single frame. Monsters flinch too: they flashed white and went on swinging, which
is why even a crit read as a number rather than an event. Gated on a hit worth
seven per cent of the creature's own health and a 900ms cooldown, because a
dagger lands three blows a second and reacting to each would leave anything
fast-attacked permanently mid-stagger — with crits always shown. A nineteenth
suite checks that every state in the union binds for players AND for everything
else, and that something actually PLAYS it: a state nobody plays is an absence,
and an absence looks exactly like a decision. **M67.2** then found the mirror of
the monster gate: the player's own hit reaction fired on any HP decrease at all,
measured at 3.1 interrupts a second for a burning character in a wolf pack — the
animation meant to acknowledge being hit was locking them out of their own swing.
The two are gated differently on purpose, because a player's health outgrows
monster damage so fast that one share threshold is both too loose at level 1 (a
burn tick is 12% of fifty health) and too tight at level 40 (a troll's slam is
4.3%): a monster's problem is magnitude, a player's is frequency. The suite's own
ruler was wrong three times on the way — twice reading its comments instead of
its code, once unable to find the end of a function. **M67.3** then posed the
skills. One `play("attack")` had served all forty-three, so a sword user pressing
Mend did a sword swing and War Cry was a sword swing — while `Spell1` and
`Spell2` sat in the pooled library reachable only as a WAND'S ORDINARY ATTACK.
What you hold decides how you swing; what you are doing decides whether you swing
at all. Except that **a bow is its own delivery**, which is why the pose reads the
weapon back: fourteen skills a bow looses are ones a staff casts, and archery
being a spell cast would be the same mistake in reverse. A channelled cast holds
its pose for the length of its bar now, too — standing in an idle for three
quarters of a second and then throwing something is a pause, not a cast.

**Phase 66 M66.1 — something that throws it.** Twelve of the thirteen kinds were
melee, so every fight in the game had one shape: it runs at you and you stand
there. And the table already said otherwise — *"a demon is made of the fire it
throws"*, *"the thing that throws it back at you"*, *"spines with something on
them"* — all written beside creatures with a sixty-pixel reach, which is the same
defect as `shape: "none"` on a missile one phase earlier. The cactoro, the demon
and the golem fight at range now and give ground as you close; the ghost stays
melee because its own line says a cold TOUCH, and that discrimination is what
keeps it a fix rather than a redesign. **A backpedal may never match the player's
speed** — the golem gives ground at 28px/s against your 220, which makes it a
turret you walk into rather than a statue you stand beside. They throw the same
lit bolt the player does, tinted by their school, because fire arriving from
across a clearing with nothing in between is less legible than being punched.
Measured live at exactly its reach × 0.8 while standing still, and catchable when
chased. Both rulers were wrong first: one chased the whole time and called the
intended outcome a failure, the other measured a monster dying to a leftover
attack order and blamed the AI for fleeing.

**Phase 65 M65.1 — a camp is a place with animals in it.** The monster AI had
more in it than it looked — threat retargeting, leashing, melee slots, leaps,
separation, telegraphs — and nothing at all for what a creature does when it is
not fighting you. Thirteen kinds stood on their spawn pixel, facing one way, for
the life of the world. They drift about their posts now at a grazing pace, jittered
per creature so a camp does not step off together, and **a boss holds station**,
because a thing you walk a long way to find is worth more standing sentinel than
milling about. The back rank of a pack circles instead of standing in a polite
semicircle: the melee cap has had them waiting since Phase 42 and they looked
broken rather than queued. Measured from spawn without touching anything —
71 of 71 ordinary creatures drift, all nine bosses hold, and nothing escapes its
leash; turning the wander off takes it to 0% and the suite says so. Still open,
and flagged as its own milestone: **twelve of the thirteen kinds are melee**, so
every fight has the same shape.

**Phase 64 — spells you can see, and time to react to them.** *"Skills should be
very good high quality animations and effects, with cast time, good cool looking
visible projectiles (right now you can barely see them)."* Measured first: at
this camera one world unit is about fifteen pixels, so an arrow's trail was ONE
pixel wide, a beam was a one-pixel core in a two-pixel glow, and a staff's bolt
was a soft atlas smudge — and the three signature caster missiles, `arcanebolt`,
`firebolt` and `frostbolt`, were `shape: "none"` and threw nothing at all. A bolt
is real lit geometry now, with a **travelling point light** that lights the
ground it passes over, and a ranged skill throws **what your weapon throws**,
read off the same table the ordinary attack uses rather than a second one. The
damage number waits for the projectile to arrive. Then the other half of the
brief: **a cast time**, on ten of the forty-three skills, derived from the
cooldown rather than typed — ranged damage and heals only, because standing
still in melee while a troll winds up is a death sentence with no counterplay,
and never the two cheap skills that carry the rhythm. Moving breaks it, pressing
something else is refused rather than queued, and the bar freezes where it got
to so you can see how close you were. It pairs with M63.1's opening: the seconds
after a boss commits are when you can afford the big one. The first live run
found a bug in the feature itself — the global cooldown was charged twice, so a
500ms cast was refused at the instant it completed.

**Phase 63 M63.1 — a fight you can be good at.** Reported from play: *"you
attack while facing away or running away"*. In a game with no strafe animation
those are one state, and the auto-attack swung straight through it — a character
sprinting one way while damage numbers came off something the other way. You do
not swing at what is behind you now, the body faces what it is fighting instead
of where its feet are going, and the predicate deciding both lives in `shared/`
because two thresholds would give you a character facing its target and not
attacking. Then the larger half of the brief — *more skill-based* — which needed
nothing invented: a telegraphed slam leaves the creature **`recovering`** for
2.2 seconds at half again damage taken, whether it hit or missed, so reading a
wind-up stops being a punishment avoided and becomes the best two seconds you
will get on that boss. Measured live at 469 damage standing against 0 running
away. **And hunting for that turned up three bugs nobody had reported**: Shield
Wall granted `enraged` — +35% damage DEALT — instead of halving damage taken,
its own status row unreachable for the life of the skill; two of the four paths
that damage a player ignored every damage-taken multiplier, including the slam a
brace most obviously exists for; and mana never regenerated at full health,
because the whole block sat behind an early-return for uninjured players.

**Phase 62 M62.1 — an axe has no opinions.** The damage schools have been the
deepest system in this game since Phase 48 and nobody had ever asked who can
actually deal one. Measured: **an axe could not deal a single element by any
route** — no weapon at any band, no skill anywhere in its tree — and nor could
fists; a sword reached one at band 4 and a mace at band 5, and neither could cast
anything. Four of the eight talent trees were locked out of it, while the two
caster families had all five elements from tier 0. The other half of the same
measurement: fire arrived one ring after the first creature that folds to it,
nature two and frost four — against a rule this project had already written down
inside `Levinbrand`'s own comment and applied to lightning alone. Five weapons
fix both, and not one needed an artist: an existing mesh and an existing
elemental palette, which is what the catalogue's three independent axes are for.
No stat mods on any of them — the element is the whole difference, and it cuts
both ways. The test now states all three rules, and **found the last gap itself**
(frost at band 3 against an armabee at band 2), which is how the frost bow came
to exist.

**Phase 61 M61.1 — the Provisioner takes something in.** *"He only sells, never
buys"* — and the obvious version of that is a downgrade, because a counter that
turns an unwanted sword into materials is salvage without the half that teaches
you the recipe. So he takes RAW MATERIAL instead, and the shortage that answers
was measured first: across the catalogue, demand runs wood 35% / ore 56% / herb
9% against a supply of 50 / 38 / 12, so **ore is the bottleneck by a factor of
two** and everyone ends up holding wood and herb they cannot spend. Four to one
in every direction, steep on purpose — near par the exchange would delete the
bottleneck, and the bottleneck is the reason to walk to the far rings where the
rock is. Essence is refused, and the greeting that had promised "all four" since
before the counter could take anything is corrected, because essence off kills is
what keeps the reforge ladder honest. Six trades behind one row rather than six
more rows in a list that is already nine. A nineteenth suite drives it over a
real socket, since every failure of the server half is silent — mutating away the
spend guard hands free ore to a character with five wood, and it is caught.

**Phase 60 M60.1 — a back yard says what the building is.** Reported from play:
*"the chapel's back yard is still the emptiest of the six"* — and the first two
measurements said the opposite, which is the whole milestone. Counting props put
the chapel top; what a person was actually looking at is that **half the back
yards in Emberhold cannot be seen at all.** This game has one camera bearing, so
"behind" is permanent, and a yard is further out than its own building — so the
inn's, the shop's and the east cottage's sit behind their own walls from every
position a player can stand in. Of the three that exist, the chapel's held a
washing line and a water butt against a pell and a hayrick. And the washing line
was somebody else's: `town.ts` calls it "the two cottages'" and it was typed six
degrees off a chapel with no beds in it. Back-lane props name their building now
and the bearing is DERIVED, so being behind the wrong one is a spelling mistake
rather than a plausible number. The chapel got a burial ground and the votive
lamp it is named for, which had nowhere to stand; the shop got the crates and
sacks a counting house keeps out the back; the east cottage got a chopping block,
because it was the one yard with nothing of its own. Four checks, one of which —
that everything placed is actually drawn — caught a fifth rain barrel that the
client's hand-typed list would have collided with and never rendered. Three
rulers were wrong on the way, including the distinctiveness check passing the
very mutation it was written for.

**Phase 59 M59.1 — everything on the ground is on the ground.** The fourth time
this project has had the same argument, one level down each time. Five skill
shapes — a nova, a lingering pool, a cleave, a heal pillar and a volley — were
drawn at a **literal y = 0**, which was right for exactly as long as the ground
was a plane and has been wrong since Phase 53 gave it relief: measured, that is
more than half a character off the ground across 28.9% of the play area. Every
ground ring was placed on the smooth analytic field rather than on the mesh you
can see, and lifted three centimetres against an error of up to 0.184. And they
were flat, which on ground that is not flat is a chord — so they follow the
ground per VERTEX now, because a single tilt is not a smaller version of that fix
but one that runs out: it leaves a five-unit reach ring 0.55 units buried at p95.
**The telegraph is what decides it** — photographed on the steepest ground in the
bands, a flat slam marker is a sliver and a flat reach ring a crescent, most of
both inside the rise, which is the troll's whole mechanic not working rather than
a cosmetic fault. Townspeople were still standing on the field too, which is the
worst of the three because they never move. An eighteenth suite enforces which
feature may read which height, with a written reason for every exception, and
asserts that the rule is load-bearing so it cannot go vacuous unnoticed. Three
realistic mutations fail it. The ruler was wrong first again, in a new way: a
riverbank probe returned every sample near-black because `freeze` only sets a
field and the loop that applies it had already been stopped.

**Phase 58 M58.1 — what it folds to.** Damage has had a school since Phase 48 —
six of them, thirteen creatures each with something that hurts them, five
elemental palettes, five elemental spells, a target frame that says what the
thing in front of you folds to and a log line that says you burned it — and
nothing in the world had ever asked anybody to use any of it. A player could
finish all eleven quests in Emberhold and never learn that a troll knits itself
back together unless you burn it. So there is a `slay` objective now, and it is
the only work in the game that says HOW rather than where: five quests, one per
element, from Elsbet Vane, who has had the topic since Phase 49 and has been
answering it into the air ever since. **"Killed it with" means MOST of your
damage** — not the killing blow, which is the one thing in a fight the player
does not choose, and not any of it, which one firebolt inside a sword fight
would satisfy — so the objective is met by FIGHTING AS the element rather than
by garnishing a fight with it. That rule moved into `shared/` before it had
produced a single defect rather than after three, and every pair the quests name
is read out of the real resist table by the test, because a quest telling
somebody to burn a demon would be the game teaching a lie in its own voice.
Measured live: twenty-four armabees killed with lightning move the counter by
nothing, and twenty-four killed with frost fill it. Both rulers were wrong
first — the brief check was satisfied by the word "firebolt", and the probe
asserted "+1 per kill" at an auto-battler that kills as many as it likes.

**Phase 57 M57.3 — a trench at each abutment, and the height field finally gets
a test.** *"The gap between the north bridge and dirt path, again"* — and again
is the word: the third report about this crossing in four phases. Measured, with
the deck at 0.426, the ground five pixels past the north abutment was -0.849. A
ditch seventy per cent of a character's height immediately off the end of the
planks, which the road ribbon dived into as well, which is what read as the
track stopping short. The cause was one branch left over from M54.1a — riverbed
under the deck, ramp outside it — so the height field STEPPED, and a mesh
sampled on a 1.63-unit grid cannot draw a step, it draws a wedge. There is no
branch now: the deck's overhang is an abutment, solid ground at deck height,
which is what a bridge lands on. And the durable half — the height field moved
out of `World.ts` into `heightfield.ts`, three.js-free and loadable by Node,
because all three of its reported defects were unreachable from `tools/test/`.
A seventeenth suite walks the crossing and asserts CONTINUITY; reverting the fix
fails six of its checks.

**Phase 57 M57.2 — the air was six times too thick, and a bird was three times
too big.** *"There are still too many butterflies around"*, reported from play
for the second time — and the first fix had made it six times worse while every
number in it was argued for in writing. M54.2 halved the butterfly pool and cut
the neighbourhood's AREA by eight in the same milestone, which is a sixfold rise
in density that nobody wrote down, and it reasoned about one of the two
butterfly kinds and never added the other in. Measured before anything changed:
ninety on screen at once, against forty already reported as too many. Pools are
DENSITIES now, derived from the radius, which is the call this log already
recorded for the treeline and the ground cover. The same measurement then found
a bird drawn seventy-three pixels across against a twenty-eight-pixel player —
three times the height of the character, under a comment asserting it would be
"still small on screen". And a sixteenth suite enforces the rule `ambience.ts`
states about itself in its first paragraph and nothing had ever checked: nothing
in it may be sized like a character.

**Phase 57 M57.1 — a world you can hear.** Sound has existed since Phase 39 and
has never been a PLACE: twelve baked cues fire when something happens and
between them the world is silent. There are six beds now, every one of them a
pure function of where you are, when it is and how hard it is blowing — derived
and not sent, for the same reason the hour and the wind are. Wind whose filter
opens as the gust rises rather than only getting louder; leaves that TAKE OVER
from it under a canopy, because a wood is sheltered and its sound is two octaves
up; the Coldwater; fire read off the same tables the flames are placed from, at
the forge by day and every brazier and torch after dark; birdsong as events
rather than a bed, in two calls; and a cricket chorus built out of a gate rather
than a tremolo, because a cricket is a rate and not a pitch. All synthesised,
for the reason every building in Emberhold is generated. The twelve cues moved
onto the same graph, which was the point rather than the tidying: `M` has to
silence the world as well as the cues, and two subsystems with two volumes is a
mixer with a bug in it. Verified by tapping an AnalyserNode onto the busses —
level and four bands, per place and per hour — because an audio graph is the one
part of this project with nothing on screen, and by a fifteenth offline suite
that checks the world the beds READ, since every failure of that half is an
absence rather than a fault.

**Phase 56 M56.1 — the ground under your feet.** Two follow-ups written down at
the end of Phase 55, and they turned out to be one complaint: the feet are
geometrically planted and they do not look it. The rig's ground lift is per
STATE now rather than one worst-case constant, so idle sits on the grass instead
of hovering 38mm over it, and an attack and a stagger — which the old
measurement never covered at all — sit right too; the crossfade between two
states blends the seat with the mixer's own weights, so it is exact by
construction. And there is a contact shadow under every player, monster and
townsperson: not the cast shadow, which has existed since Phase 47 and walks
away from the feet at every hour but noon, but the ambient a body keeps off the
ground it is sitting on. It multiplies rather than paints, its strength is
constant because a multiply already gives you the light-dependence for free, and
it is TILTED to the ground — a level quad is a chord, and the drawn ground rises
through one by a median of 86mm against 3mm for a tilted one, which is M55.3's
own lesson a level down. Three rounds of measurement, two of which found the
PROBE was wrong: once for differencing two frames of a world that was still
moving, and once for measuring a multiply in absolute channel delta rather than
as a ratio.

**Phase 55 — one character.** The body stops changing when the weapon does, and
it keeps every animation: all five rigs share the same forty-four bones, so the
twenty-five clips welded inside five character files were pooled into one
library and the tool in your hand now decides everything about how you fight and
nothing about who is holding it. What that left behind was four character models
nothing loads, still wearing their clothes — ten of those pieces are harvested
onto the one body where the kit's version beats what the game generates. The
body is tinted from the character's NAME, which is a character creator that
needs no column, no wire field and no creation screen. And the feet were put on
the ground: the rig is seated in a bind pose no clip ever holds, and the ground
it stands on is a mesh whose flat triangles ride above the field they were
sampled from.

**Phase 54 M54.2–M54.5 — the world is alive, on fire, in weather, and you can
find yourself in it.** Butterflies over meadow by day and fireflies in the woods
after dark, living in a moving neighbourhood round the player rather than placed
across four kilometres nobody can see. Real fire on every torch and brazier —
one instanced billboard whose shape is cut and animated in its own shader,
replacing the emissive ball every open flame in the project had been since
Phase 47. Ground mist that lies over the water and in the hollows and burns off
by mid-morning, taking the sky's own colour so it can never be a different
weather from the sky. And an outline on every player plus a pool of light at
their feet, which turned out to be the same feature as fixing the through-walls
silhouette: both were asking for the shape of a person and nothing inside it.
Five rounds of measurement, two of which found the PROBE was wrong rather than
the game.

**Phase 54 M54.1 — the world moves, and the world was never sparse.** Wind, on
every blade of grass and every tree, derived from the wall clock like the hour
so two players in the same field see the same gust. And underneath it, the
oldest bug in the project: the seeded generator every scatter in the game was
built on had 11,064 distinct values, because the textbook C LCG overflows a
double in JavaScript before its mask runs. Eighty-two thousand plants were being
placed on about five thousand positions, in stacks, while every counter reported
a full world. It took six rounds of bisection, and the one that found it was
scaling every instance near the player up six times and watching 379 of them
turn into five clumps.

**Phase 53 M53.4 — six woods, and a river with one bridge over it.** The last
milestone of the phase, and the two halves are the same idea from opposite
ends: a forest gives the frontier places, and a river gives it a shape. Forests
could not exist under the rule that kept every tree outside the play bounds, so
the rule was sharpened — the woodcutter's tree is the round-crowned broadleaf
and every conifer, twisted trunk and dead stick is scenery — and the woods live
past the last monster camp, because the five bands are where the game is played
and trunks cost telegraph readability. The Coldwater is the first solid thing
outside the palisade, and it buys the road its second property: the bridge is
the only way across, so the whole northern half of the map funnels through one
point on the road. Its bed is cut into the land, its surface is the land along
its own course low-passed and forced downhill, and the bridge is derived from
where the two curves actually meet. Plus `placeNameAt`, which is the first time
this world has said any of its own names out loud outside a quest brief.

**The item system rebuilt and
followed through, damage that knows what it is made of, every timed effect in
one table with a row on screen, a front door worth walking through, a town to
walk through it into — and now a material for the one element nobody could
ever be holding.**

**Phase 50 M50.1 — Storm.** The thirteenth palette, and the first thing in the
game added because a test kept printing a number: `lightning 0 weapons`, on
every run since damage got a school. Three weapons across a warrior family and
a caster one, five slots of kit, and a Stormbound set that wards against the
element it is made of. It comes off the golem, which is the creature with
lightning for a seam — so the counter to a golem is a thing you get by killing
golems the slow way first. And the golem now THROWS lightning as well as folding
to it, because before that, five elements could be worn against and only four
could ever be thrown at you.

**Phase 53 M53.3 — the ground stops being a plane.** The play area had been kept
dead flat since the port because elevation would be a lie the server does not
know about; it is a lie, and it is free, because every distance here is measured
in XZ and nothing reads a Y. So height is purely a rendering property now, and
putting it in cost one `onGround` helper spread through every call that used to
pass a literal zero — actors, nodes, loot, targeting rings, the camera, and the
road ribbon per vertex. Anything BUILT gets levelled ground under it. The first
amplitudes were three times too timid to see at a forty-degree camera, and a
black band across the far ground turned out to be Vite serving `index.html` for
six textures downloaded after the dev server started.

**Phase 53 M53.2 — the ground stops being one green.** Four Poly Haven surfaces
rather than two, and three noise fields at scales chosen not to be multiples of
each other: a regional drift between two grasses over a hundred and fifty units,
wear cut into it with a broken outline so a bare patch is not an ellipse, and
gravel riding on the wear so the worst of it has an edge rather than a fade. Plus
a metre-scale detail layer that exists only within 34 units of the camera —
which is what actually fixes "plain", since the ground at the player's feet is a
third of the screen and had been drawn with the same information as the fog line.
The tile halved to 3.4 units to put detail underfoot, and the three fields are
what pays for the repeat that would otherwise expose.

**Phase 53 M53.1 — five times the ground, and a road out of it.** The world is
16,000 x 12,000 now, and the difficulty rings deliberately did NOT grow with it:
Emberhold's neighbourhood is tuned, so every new pixel is frontier rather than a
wider version of the old land. A third gate opens on the north side — at 256
rather than 270, because due north runs the road through the shop — and a dirt
track curves 108 units from it to the site of Coldharrow, threading between four
monster camps so that following the road is the safe way north and cutting the
corner is not. Fourteen torches light it after dark, and only the nearest five
own a real light: every torch always has a flame, which is what makes the road
read at midnight as a line of fires going north, and a fixed pool of PointLights
follows the player. Two things fell out of it — `inGateway` had asked the
opposite question since Phase 49 and got away with it because two gates were
exactly antipodal, and the road spent one run invisible with all 5,184 normals
facing the ground.

**Phase 52 — Waystones, and two verbs the world was already laid out for.** Six
quests had three verbs between them and none of them mentioned the deepest thing
about this world: every camp, ring and band is measured from spawn, so walking
further out IS the progression. There are four standing stones out there now —
the first built things past the palisade, one per band, spiralling outward round
the compass — and `reach` sends you to them. The stones were most of the work,
because the verb is ten lines and is worthless without somewhere worth arriving.
`salvage`, which had been a `QuestObjective` variant with nothing pointing at it
since the day quests shipped, is wired too. Crediting a position is deliberately
not a per-packet database read: four hypots run every `MOVE` and the quest table
opens only on the tick somebody actually arrives. The minimap grew rim arrows
for work in hand, because the nearest stone is four times further than the
widest zoom can show.

**Phase 51 — Emberhold, dressed.** Three things the user saw and the tests
could not. A SKELETON on every character — M49.2’s silhouette testing against
the actor’s own gear instead of against the world, fixed by render order rather
than by a depth bias. A STATUE on the centre, which needed `PLAYER_SPAWN` and
arrival to become two different things: spawn is the origin every band is
measured from, arrival is a place, and splitting them freed the best spot in
town. The figure is the game’s own Warrior rig holding one frame of its own idle
and repainted in stone — the one loaded object in a generated town, because a
downloaded building would clash and a person is the opposite case. And a SEAM
right across the square that survived shadows-off, lights-off and bare-terrain
tests and turned out to be the road: one plane laid under the plaza with a hard
alpha edge that perspective stretched across the frame.

Then the dressing it was all in aid of: bunting on a sagging curve round the
lantern ring, window boxes under every upper window, planters, a handcart, a
notice board and two braziers. All of it solid, all of it positioned from
`shared/town.ts` so what is drawn and what you walk round are one entry.

**M51.1 — the back lane.** The belt between the houses and the palisade looked
bare because the ground-cover scatter had been excluded from the whole town to
protect paving that only reaches two thirds of the way out — every blade of
grass inside the wall had been deleted for it. Fixed by making the exclusion a
list (the paving, and each building), then dressed with the things a village
keeps out the back. A new rule — nothing solid may stand inside a building —
then caught seven props that had been standing in the shop and the cottages
since the square was widened, none of them visible from anywhere anyone walks.
The ring bearings are derived from the real footprints now, and there is room
for seven, not eight.

**M51.2 — the monument, and the flags.** Two things the user asked about and one
they did not. The statue was 1.4 times life size on a pedestal taller than a
person, which reads as somebody standing on a box; it is 1.9 times now, bounded
at the top by the inn's eaves rather than by anything about the player. The
bunting's flags had been cut to a fifth of their width to fix the arrowheads and
the SPACING never followed, so the line read as a cable with litter on it — width
and density are one constant pair now, at the ratio real bunting hangs at. And
framing the statue for a screenshot found the Herald standing 8 pixels off its
axis, up-screen: this game has one camera bearing, so "behind the monument" is a
permanent property of a bearing rather than a place somebody walks through, and
every actor's through-walls silhouette had been tracing a mage down the stone all
day. She has moved, and the town test fails anybody who stands there again.

**M51.3 — the townspeople walk.** Five people had stood perfectly still since
Phase 49, in a square where the bunting, the coals, the sun and the windows all
moved. They have rounds now — a handful of stops each, derived from the wall
clock in `shared/` exactly as the hour is, so nothing goes over the wire and the
shopkeeper the client draws and the one the server prices from are the same
function of the same clock rather than two systems agreeing to stay in sync.
Starting a conversation is measured to where somebody is standing; keeping one
is measured to their post, which does not move — a sum with a proof behind it in
place of the server's old slack multiplier. The game also learned to WALK: every
character rig ships a `Walk` clip that had never been played, because `run`
listed it only as a fallback and so every body in the game had sprinted since
the port. And the round-walking test immediately caught the sight-line rule from
one milestone earlier going green on a beat that reproduced its exact defect —
which turned out to be fixable only one level up: townspeople draw no
through-walls silhouette at all now, because that outline is for finding the
character you are responsible for and a resident behind fixed scenery is a
permanent blue figure painted onto it.

Before that, Phase 50.

**Phase 50 M50.2 — skills that read a status.** Fourteen timed effects existed
and every skill that touched one PUT it there; nothing had ever asked whether
one was already running. Eight skills do now, one per weapon tree, in the three
shapes the genre has: a finisher that leaves the bleed running, four detonators
that spend the condition for a burst, and two cleanses. Onslaught is the only
skill in the game that spends something GOOD — the rest of your War Cry for one
blow. It is a `reads` field rather than a conditional in code, so the tooltip,
the talent panel and the tests all read the same rule. An empowered hit flashes
amber and says which condition paid, because a conditional the player cannot see
is one they will not play around.

It also found a hole nine phases old: **you could not put a weapon down.** There
was no unequip anywhere in the game, which meant the whole fist tree — and the
archetype the README calls "a real (if weak) one rather than a broken state" —
was unreachable for every character past their first sword. Clicking a filled
slot on the paperdoll takes it off now.

Before that, Phase 49.

**Phase 49 — Emberhold.** The world's one built thing was a smithy that also
happened to be spawn. It is a town now: six generated buildings on a ring
inside a palisade, a paved square with a monument, a road running gate to gate,
and five people who each do something the game could not do before — a Herald
who explains the rules out loud, a Provisioner with a real shop priced in
materials, two quest givers with six quests between them, and an apprentice at
the anvil. Nine procedural textures and world-projected UVs replaced the flat
colour it shipped its first hour in. Lanterns and lit windows come on by the
hour; the ambient lift that makes the square legible at midnight is scaled by
how close you are standing, so nobody carries it out into the field. Walls are
the first static obstacle the game has ever had. The world grew by half in each
direction and every ring — bands, nodes, camps, treeline, ground cover — moved
out with it, because everything radiating from the centre had been measured
against a centre that used to be a single prop.

Before that, Phase 48 M4.2.

**M4.2** replaced the login card. The world renders behind it now: the same
terrain, trees and forge the game draws, held at dusk, swaying across one
hand-picked arc with a smith at the anvil. The paragraph explaining that there
is no class to pick became four tiles showing each archetype and the weapons
that make it, derived from the weapon table so the first screen of the game
cannot lie about it. Nothing is awaited — the card is live on the first frame,
and a refused WebGL context degrades to the flat gradient.

**M4.1** replaced four hand-written status timers with one table, added eight
skills — one per weapon tree, so no weapon was left out — and gave the whole
thing an indicator row. A status is a row speaking the same `PassiveBonus`
vocabulary everything else does, so a buff reaches damage through code written
years before buffs existed; two bespoke multiplications were deleted rather
than rewritten. Buffs sit left and round-shouldered, debuffs right and notched,
and time drains as a sweep. Monsters inflict them back, which is what gives the
harmful half two sides. Storm Bolt closes M4's documented lightning gap.

**M4** gave damage a school. Six of them, physical included, so that what you
are holding decides not only how you fight but what you are good against —
which is the half of this game's premise that was never actually true. A
weapon's school comes from its family and its material, so Frostbrand deals
frost; thirteen creatures resist and fold to different things, never by more
than half and never in the first ring; monsters deal typed damage back, which
is what the four elemental matched sets and one suffix per element are for. The
target frame, the tooltip, the character sheet, the floating numbers and the
combat log all say it.

Before that, Phase 0 through 48 M3.1. **The item system, rebuilt and then
followed through.**

**M3.1** made a cut rune survive the fire. M3 shipped etching with a warning on
it — reforging re-rolled etched affixes away — which made the verb endgame-only
by accident and left the panel with nothing to say but "do these two things in
the other order". A reforge now re-rolls what the dice gave and keeps what was
paid for, so a player who has cut every slot on an item has bought their way out
of the gamble one rune at a time, and the ladder stays a re-roll for everyone who
has not.

**M2.1** made a bag slot hold a KIND rather than an instance. Six copies of one
Worn dirk are one cell with a six on it, the cap counts cells instead of rows,
and equipped items stopped taking bag space they were never shown to be using.

**M2.2** gave the materials a second tier and the smithy a fourth verb. Ingots
and wardweave are made at the bench out of raw and found nowhere; the far rings
of the catalogue and the top half of the ladder are priced in them. The reforge
curve went from `band × step²` raw — 1,256 on a band-5 last step — to a linear
raw line with the superlinear part carried by refined stock, so the whole climb
now costs about what one of its old steps did.

**M2.3** turned the affinity table round. A boss's signature has existed since
M1.7 and was visible nowhere: the target frame now says what the thing in front
of you is known for, and the item tooltip and the forge's locked rows say where
one comes from — which turns the forge list from a rule into a lead.

**M3** gave the bench a fifth verb and the item system its first way of moving
value BETWEEN items. Draw destroys something to keep one of its affixes as a
rune; Etch cuts that rune over an affix on something you are keeping. Never
adding a slot, and never onto an item that could not have rolled it — so the
quality ladder and the band gates both stay meaningful.

Before that, Phase 0 through 48 M1.15.

**M1** replaced the item model: a catalogue of named things (107 now), a
seven-step quality ladder whose names are conditions rather than colours, an
off-hand slot, and a smithy with three verbs.

**M1.1** made weapons feel different — 37 of them carried per-item multipliers
that nothing read, so a claymore played exactly like an arming sword. One
resolver per number now; dps spans 1.6x across the catalogue.

**M1.2** put loot on the ground, as the item's own model, picked up by walking
over it.

**M1.3** gave the palette axis meaning: twelve matched sets, deliberately worth
less than one quality step. The test refused eight of them, so 29 base items
were added.

**M1.4** replaced the forge's level gate with a learned one — a recipe comes
from SALVAGING one, which is what ties the three verbs into a loop.

**M1.5-M1.6** stopped the bench making the player do arithmetic: both Forge and
Reforge preview what they produce, one button clears the bottom of the ladder,
and essence and learned recipes are felt rather than logged.

**M1.7** made loot reflect what dropped it — material affinity per monster kind,
and a signature item for each of the three bosses.

**M1.8** marks straightforward upgrades in the bag, and explains why a shield
comes off when you draw a two-hander.

**M1.9** turned the top of the reforge ladder from a gamble into a decision: at
Runed and Enchanted the player names one of the affixes.

**M1.12** put the same upgrade mark on drops lying in the world, and dimmed the
ones somebody else has first claim on.

**M1.13** broke the Statistics tab down by source, since four systems feed it now
and a total cannot say which is doing the work.

**M1.14-M1.15** turned consumables into a table — one pair of messages for the
whole thing, two new entries, and the healing cooldown became a group rather
than a potion. The four superseded paths were then deleted, since the dead one
still carried the by-name gate.

**M1.10-M1.11** followed the economy through. Gathering paid one per node while
forge costs had grown to 327 — so yield now scales with the band a node stands
in (2/3/5/8/12), five new node rings reach bands 4 and 5, and the two upgrade
curves went from linear to quadratic because a cost that grows more slowly than
the income it paces is not a cost.

Before that, Phase 0 through 48 M1.4 (2026-08-20).

M1.5 and M1.6 stopped the bench making the player do arithmetic: both Forge and
Reforge now show what they would produce before you pay, one button clears
Broken and Worn out of a thirty-slot bag, and essence and learned recipes are
felt rather than logged.

M1.4 replaced the forge's level gate with a learned one: a recipe comes from
SALVAGING one, so the three smithy verbs form a loop instead of sitting as three
unrelated buttons. Band 1 (21 of 107) is known from the start; everything else
has to be taken apart first, and materials remain the real cost — a level-1
smith who salvages a band-5 sword has learned something they cannot afford,
which is more interesting than a locked list. Locked rows are shown with
"salvage one to learn it" on them, because the system has one rule and a hidden
row never teaches it.

M1.1 closed a promise the data made and the game did not keep: 37 weapons
carried per-item range/speed/damage multipliers and nothing read them, so a
Bloodclaim Claymore played exactly like an Arming Sword. The family multipliers
had been read inline at six call sites, so adding a second factor to each would
have been six edits nobody was reminded about — one resolver per number instead
(`reachOf`, `swingIntervalOf`, `hitBandOf`). Measured across all 37, damage per
second spans 1.6x, tight enough that the choice is genuine. The tooltip also
compares against what is worn, per number rather than as one verdict.

M1.2 put loot on the ground. A kill leaves the item's own mesh where the monster
fell, turning, on a disc of its quality's colour; walk over it and it is yours.
Reserved for whoever the threat table credited, then free. A full bag now delays
a drop instead of destroying it.

M1.3 gave the palette axis mechanical meaning — it decided what an item was made
of and nothing else, the one axis a player could see and had no reason to care
about. Twelve matched sets, deliberately modest (a full kit loses to a mixed set
one quality step higher), totalled into `gearPassives` beside affixes. The test
refused eight of the twelve on the first run because the catalogue only had
those materials in two or three slots, so **29 more base items** were added:
**107 now**.

Before that, Phase 0 through 48 M1 (2026-08-19). **Latest: Phase 48 M1 — the item
system, replaced.** User brief: delete every item in the game, add a lot of new
ones each with its own model and stats, a seven-step rarity ladder named Broken
through Enchanted, and a whole new crafting system.

Items have names now, and that is the change everything else hangs off. A drop
used to be a slot and a rarity — "a rare weapon (sword)" — identical to every
other rare sword. `shared/items.ts` is a catalogue of **78 base items**, and an
instance is a base plus what happened to it. Three axes stay independent: mesh
says what shape it is, palette what it is made of, rarity only tints and
multiplies — which is what turns 23 downloaded models into a catalogue. The
numbers are derived from band and slot rather than authored, per-item weapon
tuning stops nine swords being one sword with pictures, and affixes speak
`PassiveBonus` so they reach combat through the funnel talents already use.

The seven qualities are **conditions rather than colours**, for a game whose one
fixed landmark is a forge. Broken multiplies DOWN, so the bottom of the ladder
is a real state with a real answer; Honed is exactly 1.0, so the catalogue is
authored at true values.

The smithy has **three verbs**: Forge names what you want (always Honed — the
forge decides what, the ladder decides how good), Reforge pushes one step up and
re-rolls rather than adds, Salvage breaks things down and replaces selling. A
fourth material, **essence**, comes off kills and is needed only near the top,
so the best gear cannot be made by whoever stood at a tree longest.

Art: `tools/art/weapons.mjs` fetches Quaternius's CC0 Medieval Weapons — 23
models, one zip, no textures, flat named materials that map onto the game's
material roles. The grip is still harvested off the character rig and every
model is fitted into its geometry space, so adding a weapon is a row and a file.
An **off-hand slot** joined the six, with two-handed weapons emptying it.

Old items were deleted once, on a recorded schema mark.

Three bugs worth remembering: the fitter assumed models stand up in Y (FBXLoader
has already converted them to Z-up) and every weapon came out twelve times too
big; scaling by whatever axis ends up down the grip blew shields up to five
times the character; and `appearanceOf` on the server was a second copy of
`appearanceFromItems` that silently stopped carrying the new base id, so every
remote player was drawn empty-handed.
**Next: Phase 48 M2 — ground loot, per-item attack timing.**

Before that, Phase 0 through 47 M4.8 (2026-08-19). **Latest: M4.8 — the numbers, the
wait, and four monsters breathing in lockstep.** Three loose ends, each the
oldest thing left in its corner. Floating combat text was the last of the 2D
client still on screen — one class, one keyframe, projected once at spawn and
then left to slide up a screen the world was moving under. It is a per-frame
system now: anchored to the body it came off and re-projected every frame, sized
by the hit's share of the victim's health (ten damage is a third of a slime and
nothing to a dragon), and fanned, lifted and staggered so a cleave into a pack
reads as five hits rather than one thicker number. Six treatments split by
direction rather than school, because mid-fight the only question is whether you
are winning; text about you keeps a lane of its own to the left, since the player
and the thing hitting them are a metre apart on screen. The first load has a
screen, and it is shorter: `assets.ts` counts what it is actually fetching rather
than a hardcoded total, waits for textures and not only for models, and the
decor, the character rig and the socket now run at once instead of in a queue —
the socket opens at +109ms against a last asset request at +654ms, so the screen
lifts onto a world with 32 monsters already in it. And a camp of four mushnubs
stopped being one animation played four times: every actor carries a variance
seed hashed from its server id that offsets where in the idle loop it sits and
how fast it runs it, and idle monsters now turn their heads on a seeded interval
— monsters only, since a player's facing decides where a skill goes. 44 checks
across three new headless suites, including the real mixer showing eight slimes
at phases 0.05 through 0.90 of the same clip.
**Next: M4.9 — remaining polish.**

Before that, Phase 0 through 47 M4.7 (2026-08-19). **Latest: M4.7 — the unit frames,
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
