# idlekin-clone

A browser MMORPG built from scratch — Phaser 3 client, authoritative Node
WebSocket server, SQLite persistence. Everything runs locally: a Node process
on localhost is the server, a SQLite file is the database. No cloud services,
no hosting, no accounts.

Inspired by [Idlekin](https://app.playidlekin.com/), though it has drifted a
long way from an idle game — the idle framing was removed outright in favour
of a real auto-battler with monster AI, threat, positioning and skills.

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
first run at `server/data/idlekin.db`.

## What's in it

- **Combat** — proximity-driven auto-attacks, monster AI with sticky aggro,
  leashing and heal-on-reset, a threat table that doubles as the XP split,
  melee crowding limits, a global cooldown, and telegraphed attacks you
  answer by stepping out of them.
- **Class from your weapon** — there is no class selection. `classForWeapon`
  derives it from whatever you have equipped, so swapping weapons swaps your
  skills, reach, damage attribute and mana pool. Bare hands are a real (weak)
  archetype rather than a broken state.
- **Paperdoll rendering** — characters are drawn naked and layered with one
  sprite per equipped visible slot. Style picks which art a layer draws;
  rarity only tints it, so look and tier vary independently.
- **Skills** — cooldown- and mana-gated actives per class, unlocking by level,
  with a skill tree panel and a hotbar that rebuilds itself as you re-class.
- **Gear** — six slots, three rarities, two rolled stats per item, crafting,
  selling, and an inventory cap.
- **Plus** gathering, levels and attributes, consumables, a leaderboard, a
  daily bonus, and a persistent combat log.

## Layout

```
client/   Phaser 3 + Vite + TypeScript
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

Sprites are a mix of CC0 packs and art generated offline by scripts. See
[`client/public/assets/ASSET_CREDITS.txt`](client/public/assets/ASSET_CREDITS.txt)
for provenance. Sound effects are synthesised as WAVs rather than sourced.
