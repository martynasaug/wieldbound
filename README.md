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
- **A world with ground in it** — a tiled PBR surface that mixes grass into
  dirt under one noise field and drifts its colour under another, so the tiling
  has no findable period, scattered with 4,800 instanced plants. None of that
  scatter is a tree, a boulder or a bush, because those three are the things you
  can harvest and scenery must never look interactive.
- **A minimap you can actually set up** — top right, showing resource nodes by
  kind, monsters with the one you are fighting ringed, other players, the
  workbench and the world boundary. Circle or square, four sizes, zoom by wheel
  or button, rotate-with-facing, and a toggle for every layer — all of it
  remembered. It tells the window rail how tall it is, so the two never collide.
- **Unit frames that are a matched pair** — your own frame and your target's,
  stacked so the two health bars you compare mid-fight are next to each other,
  each with a portrait, one shared bar shape and the world clock. The target's
  portrait and name carry the monster's difficulty band, and a boss gets a
  brighter border.
- **Nameplates with a hierarchy** — an ordinary monster is bare text and a health
  bar, a boss gets a framed plate, a resource node is a small dim pill and the
  workbench is a gold banner. Names are coloured by the monster's difficulty
  band, the bar keeps a pale ghost so you can see the size of a hit rather than
  just the result, a telegraphed attack winds up on the plate itself, and
  everything scales and sorts by distance so a crowded camp still has depth.
- **A day that passes** — 24 real minutes end to end, graded through eight
  keyframes from midnight to dusk, with a star dome and a clock on your unit
  frame. The hour is derived from wall-clock time in `shared/`, so every client
  sees the same sky without the server sending anything.
- **A shape per skill** — a nova rings outward, a poison pool lingers, a cleave
  sweeps a wedge, a heal throws light up from the feet, arrows fall as a volley
  and chain lightning hops target to target. Real geometry, sized from each
  skill's own radius and range rather than from a constant beside it.
- **13 monster kinds** in five difficulty bands radiating from spawn, so
  walking further from the workbench *is* the progression. Each kind has a
  verb rather than a bigger stat line — one bursts on death, one outruns you,
  one can only be hit by a high-Agility build, one has armour that ignores
  chip damage.
- **MMO-style windows** — the dock sits on the right and its panels open there
  too, laid out side by side so the bag and the character sheet can be open at
  once without covering each other or the world. Every icon in the interface is
  a real drawing rather than an emoji, and the mouse wheel zooms the camera
  between a close view that shows your armour and a wide one that shows the
  camp you are walking into.
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
- **Items** — a catalogue of **107 named things**, each with its own model,
  palette, difficulty band and flavour. Seven qualities that are conditions
  rather than colours — Broken, Worn, Honed, Tempered, Forged, Runed,
  Enchanted — where Broken is genuinely *worse* than baseline and Honed is
  exactly it. Affixes on top, seven slots including an off-hand, and
  two-handed weapons that empty it.
- **A smithy with three verbs** — Forge a named thing from the catalogue,
  Reforge one step up the ladder, or Salvage anything down into materials.
  **Salvaging teaches you to make it**, so the three feed each other: find a
  Frostbrand, break it down, and now you can forge Frostbrands.
  Plus **essence**, a fourth material that only comes off kills, so the top of
  the ladder cannot be reached by gathering alone.
- **Loot lands on the ground** — a kill leaves the item's own model where the
  monster fell, turning, lit by its quality. Walk over it to take it. It is
  reserved for whoever earned the kill for a while, then anyone may have it.
  What a monster carries reflects what it is made of, and each of the three
  bosses has a signature item worth going for.
- **Matched gear** — twelve sets, one per material, so dressing in one thing is
  worth something. Deliberately modest: a full matched kit loses to a mixed set
  one quality step higher. It is a tiebreaker with a look, not a second
  progression. Four of the slots show on the character:
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
               terrain (the ground shader), scatter (instanced ground cover),
               daynight (the hour), skillfx (a shape per skill),
               floaters (anchored combat text),
               effects, indicators, hud, sfx, assets (models + load progress)
  preview/     dev-only contact sheet of every body, weapon, style and rarity,
               at http://localhost:5173/preview/ — not part of the game bundle
  src/ui/      DOM panels — bag, character paperdoll, workbench, talent tree,
               leaderboard, combat log, target frame, action bar, minimap,
               loading screen, icons (120 baked single-path glyphs).
               Renderer-agnostic.
  src/net/     socket.ts — renderer-agnostic too
server/   Node + ws + node:sqlite
shared/   protocol-types.ts — message shapes AND the game's formulas,
          imported by both sides so they cannot disagree about the rules
```

`shared/protocol-types.ts` is worth reading first: hit resolution, stat curves,
monster stats, skills and gear aggregation all live there, so the client's stat
sheet computes exactly what the server resolves combat with.
`shared/items.ts` sits beside it and owns the *content* — every base item, the
quality ladder, the affix tables and the smithy's costs. The dependency runs one
way (items imports protocol-types, never the reverse), so one file is the wire
format and the other is the catalogue.

[`PLAN.md`](PLAN.md) is the running build log — every phase, what was built,
and a decisions log explaining the non-obvious calls.

## Art and audio

Interface icons are 120 single-path glyphs from
[game-icons.net](https://game-icons.net) (CC BY 3.0), baked into
`client/src/ui/icons.ts` by `tools/art/icons.mjs` and credited in
[`client/public/assets/ICON_CREDITS.txt`](client/public/assets/ICON_CREDITS.txt).
They carry no fill of their own, so every one of them takes `currentColor` from
whatever is drawing it — which is how a bag slot tints its item's icon by rarity
with the same assignment that colours its border. Re-run the generator to change
the set; it validates every name against the real icon index before it writes.

The workbench's smithy — anvil, bench, weapon stand, barrel, crate, whetstone —
is Quaternius's CC0 "Fantasy Props MegaKit".

Ground textures are CC0 from [Poly Haven](https://polyhaven.com), fetched by
`tools/art/terrain.mjs`. The nature kit — trees, boulders, bushes and every
plant in the ground cover — is Quaternius's CC0 "Stylized Nature MegaKit",
downscaled by `tools/art/shrink_nature_textures.ps1`.

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
(a talent tree per weapon), M3.10 (a real RPG interface), M3.11 (MMO-style
window rail), M4.1 (real icons, and a camera you can zoom), M4.2 (a world with
ground in it), M4.3 (a day/night cycle), M4.4 (a shape per skill), M4.5 (a
minimap and a real smithy), M4.6 (nameplates), M4.7 (unit frames) and M4.8
(combat text, a loading screen, monster idle variety) are done. **Phase 48 M1**
then replaced the item system outright: a catalogue of 78 named base items, a
seven-step quality ladder, and a smithy with three verbs. See
[`PLAN.md`](PLAN.md) for the full picture.
