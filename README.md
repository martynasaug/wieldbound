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

- **Combat** — you start fights, they do not start themselves: press your
  weapon's own attack (slot 1, different for every weapon family) or any
  offensive skill, and the swings continue until you walk away. The attack
  slot's curtain is the swing timer, so weapon speed is something you can see
  — a dagger lands three blows in the time an axe lands one. Plus monster AI
  with sticky aggro,
  leashing and heal-on-reset, a threat table that doubles as the XP split,
  melee crowding limits, a global cooldown, and telegraphed attacks you
  answer by stepping out of them. Every creature has a body that takes up
  room, so squaring up to something means standing next to it, not in it.
  You never have to click a monster: the game marks whatever you are actually
  fighting, and a click is an override that locks your choice rather than a
  step you owe it. Skills fire whenever *you* can afford them — off cooldown,
  enough mana, right class — never gated on something being in range.
- **Class from your weapon** — there is no class selection. `classForWeapon`
  derives it from whatever you have equipped, so swapping weapons swaps your
  skills, reach, damage attribute and mana pool — *and your whole body*, since
  each class has its own rig. Pick up a staff and you do not become a soldier
  holding a staff, you become a robed mage. Each of the eight weapon families
  also *fights* like itself: a bow looses a real arrow that takes time to
  arrive, a staff throws a bolt, a wand fires a beam, and an axe lands heavier
  and later than a dagger. Bare hands are a real (weak) archetype rather than
  a broken state.
- **13 monster kinds** in five difficulty bands radiating from spawn, so
  walking further from the workbench *is* the progression. Each kind has a
  verb rather than a bigger stat line — one bursts on death, one outruns you,
  one can only be hit by a high-Agility build, one has armour that ignores
  chip damage.
- **MMO-style windows** — the dock sits on the right and its panels open there
  too, laid out side by side so the bag and the character sheet can be open at
  once without covering each other or the world.
- **An action bar you own** — ten slots, and only you change them: drag a
  learned skill out of the talent panel, drag slots to reorder, right-click to
  clear, click a key label to rebind. Saved per weapon, because the skills are.
- **Talent trees, one per weapon** — using a weapon levels *that weapon*, and
  its proficiency hands you points to spend where you want. Nothing unlocks
  itself: all 27 skills and every passive is a node you buy. Eight trees, 73
  nodes, and about two thirds of a tree fits in a finished weapon's points, so
  which two thirds is the build. Free respec per weapon.
- **Two progressions that answer different questions** — character level is who
  you are (hit points, stat points, carried across every weapon); weapon
  proficiency is what you can do with the thing in your hand, and it is earned
  only while holding it. Stat points come with per-weapon advice, since which
  attribute multiplies your damage depends on what you are wielding.
- **Gear** — six slots, three rarities, two rolled stats per item, crafting,
  selling, and an inventory cap. Four of the slots show on the character:
  style picks the mesh, rarity only tints it, so a plate chestpiece and a
  leather one take the same epic gold and stay recognisably plate and leather.
- **Plus** gathering, levels and attributes, consumables, a leaderboard, a
  daily bonus, and a persistent combat log.

## Layout

```
client/   Three.js + Vite + TypeScript
  src/three/   the renderer: Game (orchestrator), World (scene/terrain/camera),
               Actor (animated model), gear (bodies, weapons, armour),
               attacks (per-weapon delivery + projectiles),
               effects, indicators, hud, sfx, assets
  preview/     dev-only contact sheet of every body, weapon, style and rarity,
               at http://localhost:5173/preview/ — not part of the game bundle
  src/ui/      DOM panels — bag, character paperdoll, workbench, talent tree,
               leaderboard, combat log, target frame, action bar.
               Renderer-agnostic.
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
`assets/sfx/*.wav` (synthesised, not sourced — twelve cues now, `bow` and
`beam` having been added for the weapons that do not swing). Provenance is in
[`client/public/assets/ASSET_CREDITS.txt`](client/public/assets/ASSET_CREDITS.txt).

The rest of `client/public/assets/` (`grass.png`, `props.png`, `actors.png`,
`body.png`, `gear.png`, `weapons.png`, `tiles.png`) is **no longer loaded** —
it belonged to the Phaser client removed in Phase 47. It is kept because
`tools/art/` still generates it and it documents how the 2D game looked.

## State of play

The renderer was rewritten from Phaser to Three.js in Phase 47. Milestones M1
(playable 3D client), M1.5 (13 monsters, bigger world), M2 (combat feedback,
effects, sound, UI), M3 (gear and class on the character), M3.5 (bodies
collide, no ice-skating), M3.6 (targeting and skill freedom), M3.7 (each weapon
family fights like itself), M3.8 (the default attack as a real action) and M3.9
(a talent tree per weapon), M3.10 (a real RPG interface) and M3.11 (MMO-style
window rail) are done. **M4 —
skill VFX, day/night and polish** — is next. See [`PLAN.md`](PLAN.md) for the
full picture.
