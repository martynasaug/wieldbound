# WieldBound

*You are whatever you're holding.*

A browser MMORPG built from scratch — Three.js 3D client, authoritative Node
WebSocket server, SQLite persistence. Everything runs locally: a Node process
on localhost is the server, a SQLite file is the database. No cloud services,
no hosting, no accounts.

There is no class selection. Pick up a sword and you fight as a Warrior; drop
it for a staff and you are a Mage, mid-fight, with a different skill bar, a
different reach, a different mana pool and a different swing. Bare-handed you
are an Adventurer — a real, weak archetype rather than a broken state. That one
rule is where the name comes from.

What a weapon does **not** change is who you are. You are one character, with
one body, and it stays yours across every swap — coloured from your own name, so
two people in the same armour are still two people.

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

Open the client, type a character name, and press Enter. Open a second tab
with a different name to see multiplayer. The database file is created on
first run at `server/data/wieldbound.db`.

The title screen is the game itself rendering — the same terrain, trees and
forge, held at dusk with a smith at the anvil — because every surface in this
project is procedural or CC0 and a painted splash would be the one asset
nothing here could produce or keep current. It builds in layers behind a card
that is live on the first frame, and degrades to a flat gradient if WebGL is
unavailable.

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
  skills, reach, damage attribute, mana pool *and how you move* — the stance you
  hold, the way you carry it at a run, and the animation you attack with. What it
  does **not** swap is your body. It used to: each class had its own rig, and
  picking up a staff turned you into a robed mage. That read as the purest
  expression of the rule and it was actually a rendering constraint — the kit
  welds each character's mesh to its animations in one file, and the only sword
  swing in the project lived inside the Warrior. Pooling all five files' clips
  onto the one shared 44-bone skeleton unwelds them, so the tool in your hand
  decides everything about how you fight and nothing about who is holding it.
  Each of the eight weapon families
  also *fights* like itself: a bow looses a real arrow that takes time to
  arrive, a staff throws a bolt, a wand fires a beam, and an axe lands heavier
  and later than a dagger. Bare hands are a real (weak) archetype rather than
  a broken state.
- **A town to start in** — Emberhold: six buildings on a ring inside a
  palisade, a paved square with a **stone warrior on its centre** — the town's
  own watch, cast from the game's own Warrior rig holding one frame of its own
  idle, because a project with no sculptor already ships people in exactly the
  right style — a road that parts either side of him on a flagstone island, and
  the smithy off to one corner. You arrive beside the statue rather than inside
  it: spawn is the origin every difficulty band is measured from, and where a
  person turns up is a separate, movable thing. And it is **dressed** — bunting
  slung post to post on a sagging line, flower boxes under every upper window,
  planters, a handcart, a notice board and braziers that are a real light after
  dark. All of it solid, all of it placed from one shared table, so what you see
  and what you walk round cannot disagree. **And every back yard says what the
  building in front of it is** — a pell and a spear rack behind the watch, hay
  behind one cottage and a chopping block behind the other, sheets and a handcart
  behind the inn, crates and sacks behind the counting house, and behind the
  chapel a small burial ground with the votive lamp the place is named for, which
  until now had nowhere to stand. Each of them is placed from the building it
  belongs to rather than from a typed bearing, because the last washing line hung
  by a number ended up behind a chapel with no beds in it. Every
  structure is *generated* — boxes and gable prisms in the game's own palette,
  surfaced with procedural plaster, coursed masonry, thatch, shingle and slate —
  because the CC0 kits this project draws on have props, plants and characters
  and no buildings, and a downloaded pack would arrive in a different
  stylisation from the trees behind it. **It is lit after dark**, deliberately
  and in two separate ways: lanterns and windows come on by the hour whether
  anybody is watching or not, because that is what the town looks like from
  outside it; and a warm ambient lift makes the square genuinely readable at
  midnight, scaled by how close you are standing so that nobody carries it out
  past the gate. **And the walls are walls** — the first static obstacle in the
  game — walls, the palisade, the well, the monument, the stall, the benches —
  resolved on the shallowest axis so you slide along plaster rather than being
  flung round it. **And you can always see your character**: the camera pulls in
  when something gets between it and you, the blocking building fades where it
  physically cannot, and every actor you have a stake in — your own character,
  other players, monsters — additionally carries a silhouette that draws only
  where it is behind something else. Three mechanisms, because the first two
  cannot reach a palisade, another player, or a monster behind a tree.
  Townspeople are the deliberate exception: they stand in one place for the life
  of the world, so an outline through the statue would be painted onto it
  permanently rather than being the passing hint the feature is for.
- **Five people who each do something** — Elsbet Vane the Herald explains the
  rules the game has never said out loud, and now hands out the work that proves
  the deepest of them; Oswyn Thale the Provisioner runs a
  shop priced in wood, ore and herb, because there is no currency and is not
  going to be one; Warden Cabel and Marda Quill hand out work; Tobin Ash at the
  anvil explains the bench's five verbs. One dialogue box serves all of them —
  what the options *do* is supplied by whoever opened it, which is why a vendor
  and a quest giver need no second panel between them. **And they walk their own
  rounds** — Tobin between the anvil and his bench, Cabel turning to watch the
  east gate, Marda crossing to the market stall — derived from the wall clock in
  `shared/` the same way the hour is, so nothing is sent for it and the
  shopkeeper you can see and the shopkeeper the server will sell to you cannot
  be in different places. Talking to somebody is measured to where they are
  standing; staying in the conversation is measured to their post, so nobody
  walks out of their own shop.
- **Sixteen quests in six verbs, counted off things the server already
  resolves** — a kill it credited through the threat table, a gather it worked
  out, a forge it charged you for, a salvage it just performed, **a place you
  walked to**, and **something killed with a particular element**. Kill credit
  follows the experience rule (everyone who damaged it) rather than the loot rule
  (whoever did most), so questing together is not worse than questing alone. A
  tracker sits under the minimap and hides itself entirely when you have taken
  nothing — and a quest that names a place counts down the distance instead of
  showing a counter that can only ever say two things.
- **And five that teach the thing the game never made you learn** — the Herald's
  work is the only work here that says HOW rather than where. Chill an armabee,
  burn a wolf, poison an orc, sear a ghost, and finally take a golem apart along
  the seam that lightning finds: one quest per element, each pair a real weakness
  in the table the server resolves with, walking outward past every band the rest
  of the quests stop at. What counts is **most of your damage**, not the killing
  blow — which is the one thing in a fight you do not choose — and not merely
  some of it, so the counter moves for fighting *as* an element and not for
  garnishing a fight with one. It exists because a system can be resolved, drawn,
  tooltipped and logged and still be something most players never find out is
  there.
- **Four waystones, and a reason to walk to them** — the first built things
  outside the palisade, one for each difficulty band past the first, spiralling
  outward round the compass so no two are on the same trip. The Gate Stone with
  a tally scratched into it, the Sunken leaning out of its own spoil, the Hollow
  split wide enough to walk through, and the Ashen that nobody in Emberhold has
  stood at. They exist because this world's one rule is that distance from spawn
  IS difficulty, and until now nothing had ever said so out loud: "get to the
  third ring" is a number, and "get to the Hollow Stone" is somewhere to go. The
  minimap grows a rim arrow pointing at whichever one you have been sent to,
  because the nearest is four times further out than the widest zoom can show.
- **And it is alive, and on fire, and in weather** — butterflies and cabbage
  whites over open meadow by day, dragonflies skimming the Coldwater, fireflies
  in the six woods and along the water after dark, and birds turning overhead.
  They live in a moving neighbourhood around you rather than being placed across
  four kilometres: the fog closes at 165 units, so a world-wide scatter would
  pay for a hundred thousand things nobody can see, and a butterfly is not a
  landmark anyone will notice is always in the same field. What is out is
  decided by WHERE AND WHEN, in the same vocabulary the map names places with,
  so a wood at dusk is a different place to stand in than a meadow. How many are
  out is a **density** rather than a headcount, so shrinking the neighbourhood
  cannot silently thicken the air — which is exactly what happened once, and put
  ninety butterflies on screen at a time. **Every open
  flame is a real fire** — one instanced billboard per torch and brazier, its
  shape cut and its lick animated in its own shader, so a flame gutters and
  changes silhouette instead of being an orange ball that changes size. And
  **the air has weather in it**: mist lies over the water and in the hollows and
  under the trees, thickest at dawn and burnt off by mid-morning, taking the
  sky's own colour so it can never be a different weather from the sky above it.
- **And you can always find yourself** — a soft outline on every player and a
  pool of light at their feet, warm for you and cool for everyone else, both
  fading to almost nothing at noon in an open field and carrying the whole scene
  at midnight under a canopy. This is a different problem from the three
  occlusion mechanisms above it: a leather figure on brown earth is not hidden
  behind anything, it is simply the same colour and value as the ground. It is
  also, it turned out, the same feature — the through-walls silhouette used to
  draw as a filled cutout, which is an X-ray, and both wanted the same thing: the
  shape of a person and nothing inside it.
- **And everything that stands here is standing on something** — a soft patch of
  shade under every player, monster and townsperson, tied to the body radius the
  game already collides with. There is a real sun casting a real shadow, and it
  is not this: a cast shadow says where the light is, and at every hour but noon
  it is a streak lying ten units away while the FEET — the place the eye checks —
  have nothing under them. This is the other half, the ambient light a body keeps
  off the ground it is sitting on, and it does not care where the sun is. It
  multiplies rather than paints, so the grass survives underneath it, and it is
  tilted to the slope it lies on, because a flat mark on ground that is not flat
  is mostly inside the hill. Feet also stand at the right height in every state
  now, not just the one the rig was measured in.
- **And you can hear where you are** — the world has a soundscape now, and it is
  DERIVED exactly as the hour and the wind are, so two people standing in the
  same field hear the same gust without a byte crossing the wire. Wind whose
  filter opens as it rises, so a gust is a change in colour and not just in
  volume; leaves that take over from it under a canopy, because a wood is
  sheltered and its sound is two octaves up; the Coldwater from a good way off;
  a fire you can hear before you can see it, at the forge by day and at every
  brazier and road torch after dark; birdsong in two calls, a fast trill in the
  open and a slow two-note in a wood; and a cricket chorus at night in the same
  band nothing else in the game occupies. All of it **synthesised** — four
  filters over one buffer of pink noise and a handful of oscillators — for the
  same reason every building in Emberhold is generated: a field recording would
  arrive in a different stylisation from the chiptune blip a sword makes. It
  reads the same tables the butterflies and fireflies do, so what you hear and
  what you can see are never two different places, and it sits well under the
  combat cues, because ambient audio that draws attention has failed at its job.
- **And it moves** — wind, on every blade of grass, every plant and every tree
  in the world, gusting on a slow swell with a faster gust riding it and veering
  right round the compass over half an hour. Derived from the wall clock like
  the hour is, so two players standing in the same field see the same gust
  without a byte crossing the wire. The bend is weighted by height above each
  plant's own root, so the foot stays planted; the phase is seeded from world
  POSITION, so a field is a wave crossing it rather than a field being shaken;
  and the direction is the world's rather than each plant's, because every
  instance carries a random yaw and blowing along a local axis is confetti, not
  weather. **Finding it also turned up the oldest bug in the project**: the
  seeded generator every scatter in the game was built on had 11,064 distinct
  values, because the textbook C generator overflows a double in JavaScript
  before its mask runs — so eighty thousand plants were being placed on about
  five thousand positions, in stacks, and the world looked empty while every
  counter said it was full.
- **A world with ground in it** — a tiled PBR surface that mixes grass into
  dirt under one noise field and drifts its colour under another, so the tiling
  has no findable period, scattered with 53,000 instanced plants — and the
  ground has RELIEF now, because a perfectly flat plane is the one thing no
  amount of surface texture fixes: light never changes across it. Height is
  purely a rendering property, since every distance in this game is measured in
  the XZ plane and nothing anywhere reads a Y, so it cannot desync and does not
  have to be shared. Anything BUILT gets levelled ground under it.
- **Six woods with names, and a river with one bridge over it** — the frontier
  was four kilometres of open ground with a road down the middle of it.
  Pinereach, Blackstand, the Mirefen, the Thornwood, Sorrowwood and the Weeping
  Wood are regions rather than a treeline: a warped, ragged edge, clearings
  punched through the middle, their own floor of ferns and litter, and a canopy
  the ground itself darkens under. They exist because a rule was sharpened
  rather than broken — the harvestable wood node is the round-crowned broadleaf
  and NOTHING else in the world may wear that silhouette, so every conifer,
  twisted trunk and dead stick is unambiguously scenery. They all stand past the
  furthest monster camp, because the five bands are where the game is played and
  a field of trunks costs you the telegraph you were meant to step out of.
  **The Coldwater** runs east to west across the frontier and off the map at
  both ends, and it is the first solid thing outside the palisade: the road was
  the safe way through, and now the bridge is the only way ACROSS, so the whole
  northern half of the map funnels through one point that happens to be on the
  road. Its bed is cut into the land, its surface is the land along its own
  course low-passed and forced downhill so it can never flow uphill, and the
  bridge is derived from where the two curves actually meet rather than typed
  beside them. **And the map finally says where you are** — one line under the
  minimap naming the wood, the water, the road or the town, and going blank in
  open country, because a world that names every square of itself has named
  nothing.
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
  skill's own radius and range rather than from a constant beside it — and drawn
  on the ground rather than at sea level, which is where all five of them used to
  be. That was correct for exactly as long as the ground was a plane.
- **And every mark on the floor is ON the floor** — the ring round your target,
  the ring at the edge of your reach, and the red disc where a boss is about to
  land. They follow the ground per vertex instead of being flat discs laid at one
  height, because a flat disc on ground that is not flat is a chord and most of
  it is inside the hill. **The telegraph is why it matters**: a troll's whole
  design is an attack you answer by stepping out of it, and on any real slope the
  old marker drew as a sliver — so the thing you were meant to read was the thing
  the hill was eating.
- **Buffs and debuffs, in one table and on the screen** — fourteen timed
  effects, from Rallied and Bloodlust to Burning, Exposed and Marked. Each is
  a row speaking the same vocabulary talents and affixes do, so a buff reaches
  damage through code written long before buffs existed. Damage-over-time is
  real damage of its own school, so a burn is resisted by fire resistance with
  no second rule. **The indicator separates the two three ways** — buffs left
  and round-shouldered, debuffs right and notched, and only debuffs pulse as
  they run out — because colour alone excludes anyone who cannot tell green
  from red, and position alone stops meaning anything the moment one side is
  empty. Monsters inflict them back: a cactoro poisons, a dragon sets you
  alight, a troll takes your feet out.
- **And eight skills that READ one instead of applying it** — which is where a
  set of timers becomes something you sequence. Execute hits far harder against
  anything already bleeding or burning and leaves the bleed running; Combust,
  Killshot, Follow Through and Exploit each SPEND the condition for a burst;
  Second Breath and Ward Off lift one thing off you; and Onslaught is the only
  skill in the game that spends something good, trading the rest of your War
  Cry for one blow. One per weapon tree, each reading what its own tree can
  produce, so the pair is learnable without a second player standing next to
  you. An empowered hit flashes amber and says which condition paid — a
  conditional you cannot see is one you will not play around.
- **13 monster kinds** in five difficulty bands radiating from spawn, so
  walking further from the town *is* the progression — the first camp stands
  well outside the palisade, and nothing spawns within the walls. Each kind has a
  verb rather than a bigger stat line — one bursts on death, one outruns you,
  one can only be hit by a high-Agility build, one has armour that ignores
  chip damage. **And each has something that hurts it**: a troll knits itself
  back together unless you burn it, a cactoro is a plant so a blade works and
  poison does not, a golem is stone with lightning for a seam. Never immunity —
  a wrong-school build kills a golem slowly, not never — and nothing in the
  first ring has an opinion at all.
- **Damage has a school** — physical, fire, frost, nature, arcane, lightning —
  and where it comes from is the point: your weapon's *family* sets the floor
  (a staff throws a bolt, so it is arcane) and its *material* overrides it, so
  Frostbrand really does deal frost and the Ember Wand really does burn. That is
  the other half of "you are whatever you're holding": until now the thing in
  your hand decided how you fought and never what you were good against. The
  target frame tells you what the thing in front of you folds to before you
  commit, the tooltip warns you when a swap would change what you deal, and the
  log says *"You burned the Wolf for 9 — it feels that."* Monsters deal typed
  damage back, which is what the five elemental matched sets and the resistance
  suffixes are for. **And every school is something you can be holding** —
  lightning was two spells and no weapon until Storm became a material, which is
  the thirteenth palette, three weapons, a five-slot kit, and the seam a golem
  both throws at you and folds to.
- **MMO-style windows** — the dock sits on the right and its panels open there
  too, laid out side by side so the bag and the character sheet can be open at
  once without covering each other or the world. Every icon in the interface is
  a real drawing rather than an emoji, and the mouse wheel zooms the camera
  between a close view that shows your armour and a wide one that shows the
  camp you are walking into.
- **An action bar you own** — ten slots, and only you change them: drag a
  learned skill out of the talent panel, drag slots to reorder, right-click to
  clear, click a key label to rebind. Saved per weapon, because the skills are.
  And you can put a weapon *down*: clicking a filled slot on the paperdoll takes
  it off, which is the only way back to being an Adventurer once you have picked
  something up.
- **Talent trees, one per weapon** — using a weapon levels *that weapon*, and
  its proficiency hands you points to spend where you want. Nothing unlocks
  itself: all 43 skills and every passive is a node you buy. Eight trees, 89
  nodes, and about two thirds of a tree fits in a finished weapon's points, so
  which two thirds is the build. Free respec per weapon. Every tree has at
  least one buff or debuff of its own, because a status system half the game
  cannot use is half a system.
- **Two progressions that answer different questions** — character level is who
  you are (hit points, stat points, carried across every weapon); weapon
  proficiency is what you can do with the thing in your hand, and it is earned
  only while holding it. Stat points come with per-weapon advice, since which
  attribute multiplies your damage depends on what you are wielding.
- **Items** — a catalogue of **115 named things**, each with its own model,
  palette, difficulty band and flavour. Seven qualities that are conditions
  rather than colours — Broken, Worn, Honed, Tempered, Forged, Runed,
  Enchanted — where Broken is genuinely *worse* than baseline and Honed is
  exactly it. Affixes on top, seven slots including an off-hand, and
  two-handed weapons that empty it.
- **A smithy with five verbs** — Forge a named thing from the catalogue, Refine
  raw into stock, Reforge one step up the ladder, Etch a rune into something you
  own, or Salvage anything down into materials.
  **Salvaging teaches you to make it**, so they feed each other: find a
  Frostbrand, break it down, and now you can forge Frostbrands.
  Plus **essence**, which only comes off kills, so the top of the ladder cannot
  be reached by gathering alone.
- **Runes, and value that moves between items** — every step up the quality
  ladder re-rolls, so a perfectly rolled sword used to be worth exactly what a
  badly rolled one was the moment you wanted to wield something else. **Draw**
  destroys an item and keeps one of its affixes as a rune — instead of its
  materials and instead of its recipe, so a good drop is a three-way decision.
  **Etch** cuts that rune over an affix on something you are keeping. It never
  *adds* a slot, and a rune only goes where the item could have rolled it
  anyway, so the ladder and the band gates both keep meaning what they meant.
  **And a cut rune survives the fire**: reforging re-rolls what the dice gave
  and leaves etched affixes standing, so cutting one is an investment in a
  particular item rather than something you may only safely do at the very top
  of the ladder. Cut every slot and you have bought your way out of the gamble —
  a rune and a measure of essence at a time.
- **Two tiers of material** — wood, ore and herb come out of the ground and
  essence off a kill; **ingots and wardweave are made**, at the bench, out of
  raw, and are found nowhere. Refining is the one verb whose output is not
  something you wear, and it is what the far rings of the catalogue and the top
  half of the reforge ladder are priced in. Before it, the last step of a band-5
  item cost 1,256 wood and ore — ninety gathers for one click, which is not a
  decision, it is a wait. Salvage never gives refined stock back, so every ingot
  spent on the ladder is spent for good.
- **Loot lands on the ground** — a kill leaves the item's own model where the
  monster fell, turning, lit by its quality. Walk over it to take it. It is
  reserved for whoever earned the kill for a while, then anyone may have it.
  What a monster carries reflects what it is made of, and each of the three
  bosses has a signature item worth going for — **which the game now tells you
  before you kill one.** Target a boss and its frame says what it is known for;
  hover any item, or read the forge's list of things you have not learned yet,
  and it says where one comes from. All of it derived from the loot table the
  server actually rolls with, so the game cannot send you after the wrong
  monster.
- **A wardrobe made of the rigs nobody wears any more** — when the body stopped
  changing, four character models were left in the project that nothing loads,
  and they were still carrying their clothes. Every cosmetic piece in the kit is
  a mesh hung on a named bone — the Warrior's pauldrons on the upper arms, the
  Rogue's belt and pouch at the waist, the Ranger's arm guards and hood — and
  those bones are on the one body, so those pieces fit it. They are used exactly
  where the kit's version beats what the game generates: a forged shoulder plate
  with a rolled lip instead of a dome and a shell, a real cowl instead of a
  drape. A cuirass and a mail skirt stay generated, because there it is the other
  way round, and a downloaded part that is worse than the thing it replaces is a
  downgrade with provenance.
- **Matched gear** — thirteen sets, one per material, so dressing in one thing is
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
               heightfield (where the ground is — no three.js in it, so a Node
                 test can walk it; see tools/test/crossing.mjs),
               Actor (animated model), gear (bodies, weapons, armour),
               attacks (per-weapon delivery + projectiles),
               terrain (the ground shader), scatter (instanced ground cover),
               daynight (the hour), skillfx (a shape per skill),
               floaters (anchored combat text),
               effects, indicators, hud, assets (models + load progress),
               audio (one graph), sfx (cues), soundscape (the world, out loud)
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
`shared/town.ts`, `shared/shop.ts` and `shared/quests.ts` are Emberhold —
where every building and every townsperson stands (and the round each of them
walks, derived from the clock so nothing has to be sent for it), what the
Provisioner stocks, and what the watch and the inn want doing. All three are in
server pixels like the rest of the protocol, and the wall collision lives with
them rather than in the client, so the moment the server wants to know where a
player may stand the two cannot disagree. `shared/landmarks.ts` is the same idea
pointed outward: the four waystones, in the same polar terms, so the stone the
client draws and the stone the server credits you for standing at are one entry.
`shared/road.ts`, `shared/river.ts` and `shared/forests.ts` are the three things
in this world that are NOT polar — the road crosses every ring instead of
sitting on one, and a river and a wood have nothing to do with distance from
spawn at all — so they are polylines and discs in plain world pixels, read by
the client that draws them, the collision that keeps you out of the water and
the tests that check them. `shared/places.ts` turns all of it into one answer to
"where am I".
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
seven-step quality ladder, and a smithy with three verbs — since grown to four
with **M2.1** (a bag slot holds a kind, not an instance), **M2.2** (a refined
material tier), **M2.3** (where a thing comes from), **M3** (etching) and
**M3.1** (a cut rune survives the fire). **Phase 48 M4** then gave damage a
school and every creature something that hurts it, and **M4.1** put every
timed effect in the game into one table with eight new skills and a row of
indicators. See [`PLAN.md`](PLAN.md) for the full picture.
