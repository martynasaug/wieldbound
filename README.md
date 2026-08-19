# WieldBound

*You are whatever you're holding.*

A browser MMORPG built from scratch — Three.js 3D client, authoritative Node
WebSocket server, SQLite persistence. Everything runs locally: a Node process
on localhost is the server, a SQLite file is the database. No cloud services,
no hosting, no accounts.

There is no class selection. Pick up a sword and you fight as a Warrior; drop
it for a staff and you are a Mage, mid-fight, with a different skill bar, a
different reach and a different mana pool. Bare-handed you are an Adventurer —
a real, weak archetype rather than a broken state. That one rule is where the
name comes from.

Originally started as a study of [Idlekin](https://app.playidlekin.com/), but
it has drifted a long way: the idle framing was removed outright in favour of
a real auto-battler with monster AI, threat, positioning and skills.

## Running it

Requires Node 22+ (the server uses the built-in `node:sqlite` module).

```
npm install
npm run dev
```

That starts both halves via `concurrently`:

- client — http://localhost:5173
- server — ws://localhost:8080

Open the client, enter a character name, and press Play. Open a second tab
with a different name to see multiplayer. The database file is created on
first run at `server/data/wieldbound.db`.

## What's in it

- **Combat** — proximity-driven auto-attacks, monster AI with sticky aggro,
  leashing and heal-on-reset, a threat table that doubles as the XP split,
  melee crowding limits, a global cooldown, and telegraphed attacks you
  answer by stepping out of them.
- **Class from your weapon** — there is no class selection. `classForWeapon`
  derives it from whatever you have equipped, so swapping weapons swaps your
  skills, reach, damage attribute and mana pool. Bare hands are a real (weak)
  archetype rather than a broken state.
- **13 monster kinds** in five difficulty bands radiating from spawn, so
  walking further from the workbench *is* the progression. Each kind has a
  verb rather than a bigger stat line — one bursts on death, one outruns you,
  one can only be hit by a high-Agility build, one has armour that ignores
  chip damage.
- **Skills** — cooldown- and mana-gated actives per class, unlocking by level,
  with a skill tree panel and a hotbar that rebuilds itself as you re-class.
- **Gear** — six slots, three rarities, two rolled stats per item, crafting,
  selling, and an inventory cap.
- **Plus** gathering, levels and attributes, consumables, a leaderboard, a
  daily bonus, and a persistent combat log.

## Layout

```
client/   Three.js + Vite + TypeScript
  src/three/   the renderer: Game (orchestrator), World (scene/terrain/camera),
               Actor (animated model), effects, indicators, hud, sfx, assets
  src/ui/      DOM panels — inventory, character, craft, skills, leaderboard,
               combat log, target frame, hotbar. Renderer-agnostic.
  src/net/     socket.ts — renderer-agnostic too
server/   Node + ws + node:sqlite
shared/   protocol-types.ts — message shapes AND the game's formulas,
          imported by both sides so they cannot disagree about the rules
```

`shared/protocol-types.ts` is worth reading first: hit resolution, stat
curves, monster stats, skills, loot tables and gear aggregation all live
there, so the client's stat sheet computes exactly what the server resolves
combat with.

[`PLAN.md`](PLAN.md) is the running build log — every phase, what was built,
and a decisions log explaining the non-obvious calls.

## Art and audio

3D models are CC0 (Quaternius) — see
[`client/public/models/ASSET_CREDITS.txt`](client/public/models/ASSET_CREDITS.txt).
Monsters are glTF, characters and trees FBX; the client loads both.

Two things survive from the 2D era and are still loaded at runtime:
`assets/fx.png` (the 14-school effect atlas, drawn as camera-facing quads) and
`assets/sfx/*.wav` (synthesised, not sourced). Provenance for those is in
[`client/public/assets/ASSET_CREDITS.txt`](client/public/assets/ASSET_CREDITS.txt).

The rest of `client/public/assets/` (`grass.png`, `props.png`, `actors.png`,
`body.png`, `gear.png`, `weapons.png`, `tiles.png`) is **no longer loaded** —
it belonged to the Phaser client removed in Phase 47. It is kept because
`tools/art/` still generates it and it documents how the 2D game looked.

## State of play

The renderer was rewritten from Phaser to Three.js in Phase 47. Milestones M1
(playable 3D client), M1.5 (13 monsters, bigger world) and M2 (combat feedback,
effects, sound, UI) are done. **M3 — gear and class visible on the 3D
character** — is the next piece: the weapon socket is proven to work, but
equipping armour does not yet change what you look like, which the 2D paperdoll
did do. See [`PLAN.md`](PLAN.md) for the full picture.
