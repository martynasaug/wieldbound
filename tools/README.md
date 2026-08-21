# tools

Build-time tooling. None of this runs at game time — it produces the PNGs and
WAVs in `client/public/assets/`, which are committed. You only need this if you
want to *change* an asset.

> ## ⚠️ Mostly superseded as of Phase 47
>
> The renderer was rewritten from Phaser 2D to Three.js 3D. Of everything the
> `art/` scripts below generate, **only two outputs are still loaded by the
> game**:
>
> - `build_fx2.ps1` → `fx.png` — still used, drawn as camera-facing quads in 3D
> - `build_sfx.ps1` → `assets/sfx/*.wav` — still used, unchanged
>
> Everything else (`build_paperdoll`, `build_weapons`, `build_monsters`,
> `build_props`, `make_custom_sprites`, `make_rock`, `preview_doll`) targets
> the 2D sprite client that no longer exists. The scripts and their outputs are
> kept because they are a genuine record of how that game was built — but
> **editing them changes nothing you can see in the running game.**
>
> **`icons.mjs` is the exception and is very much live** — it is Node rather
> than PowerShell, it was added in M4.1, and it bakes the interface's entire
> icon set. See its own section below.
>
> 3D models live in `client/public/models/` and are CC0 downloads, not
> generated; see the ASSET_CREDITS.txt there.
>
> `preview_doll.ps1` does have a living successor: **`client/preview/`**, served
> at http://localhost:5173/preview/ while the dev server runs. Same purpose —
> see the character wearing everything, so alignment bugs surface there rather
> than in the game — but it drives the real `Actor.setAppearance`, so what it
> shows is what the game draws. `?sheet=weapons|armour|full`, plus
> `?spin=<radians>` and `?hidebody=1`.

Everything here is PowerShell + `System.Drawing`, chosen because it needs no
toolchain beyond Windows itself. Paths resolve from each script's own location,
so the repo works wherever it is cloned.

## art/

Run any of these from anywhere; they write straight into `client/public/assets/`.

| Script | Produces | Notes |
|---|---|---|
| `build_paperdoll.ps1` | `body.png`, `gear.png` | The naked body and every gear layer, drawn from one parametric skeleton so overlays track the body's per-frame bob exactly. **This is the important one** — read its header before touching character art |
| `build_weapons.ps1` | `weapons.png` | 7 families x 3 rarities + the goblin's axe. Cells are bottom-aligned so one rotation tween reads as a swing |
| `build_monsters.ps1` | `actors.png` | The 4 monsters, composed from `src/` frames into a uniform 32x36 grid |
| `build_props.ps1` | `props.png`, `grass.png` | Every non-actor world object, flat-indexed 0..14; grass is a baked 16x16-tile mosaic under a wrapping noise field |
| `build_fx2.ps1` | `fx.png` | 14 effect schools x 6 frames, 48px cells |
| `build_sfx.ps1` | `assets/sfx/*.wav` | 12 cues synthesised as 16-bit WAVs — no samples, just arithmetic. `bow` and `beam` were added in M3.7 for the weapon families that do not swing |
| `make_custom_sprites.ps1` | `src/custom/*.png` | The hand-drawn slime and wolf frames, which the 0x72 pack has no equivalent for |
| `make_rock.ps1` | `rock.png` | Superseded by `props.png`; kept because it documents the boulder shading |
| `build_classes.ps1` | — | **Superseded, do not run.** It rebuilds `actors.png` with 12 per-class player rows (dead since the paperdoll) *and* clobbers `weapons.png` with the old 3-family layout. Kept only for its palette-swap logic |
| `preview_doll.ps1` | `tools/art/preview.png` | Composites body + gear + weapon exactly as `WorldScene` does, so alignment bugs show up here instead of in the browser. This is how the bow grip was caught planting the bow below the character's feet |

### terrain.mjs — the ground textures

```powershell
node tools/art/terrain.mjs           # download
node tools/art/terrain.mjs --check   # report sizes and URLs, download nothing
```

Fetches grass and dirt from [Poly Haven](https://polyhaven.com) (CC0) into
`client/public/textures/terrain/`. Three maps each at 1k: diffuse, normal, and
"arm" — which packs ambient occlusion, roughness and metalness into R, G and B,
and three.js reads exactly those channels, so one image serves as both
`roughnessMap` and `metalnessMap`.

Takes the `nor_gl` normal, never `nor_dx`: the DirectX convention has its green
channel inverted and would light every bump from the wrong side. 1k is
deliberate — the ground tiles every 6 world units, so resolution buys nothing
past one tile, and what stops it looking repetitive is the macro variation in
`three/terrain.ts`.

### shrink_kit_textures.ps1 — make the downloaded kits affordable

```powershell
powershell -File tools/art/shrink_kit_textures.ps1
```

Both Quaternius MegaKits ship 2048x2048 atlases — bark and leaves for the nature
kit, shared "trim" sheets for the props kit. They are stylised palette maps on
low-poly meshes and a whole tree covers a couple of hundred pixels at this
camera, so 2048 is about sixteen times more texel than any of it can show.
Shrinking to 512 took the two folders from 28 MB to 7.5 MB with no visible
difference at any zoom. Idempotent — anything already at or below the target is
skipped, so a second run reports every file as skipped.

### icons.mjs — the interface's icon set

```powershell
node tools/art/icons.mjs           # validate every name, then bake
node tools/art/icons.mjs --check   # validate names only, write nothing
```

Fetches 120 icons from [game-icons.net](https://github.com/game-icons/icons) and
bakes them into `client/src/ui/icons.ts`, which IS committed — the game imports
it, so there is no network dependency at run time. `icon-map.mjs` beside it is
the vocabulary: one semantic key per thing that needs a picture, mapped to an
`author/name` path. Change an icon there and re-run.

The source SVGs are 512x512 with a black background rect and a white glyph; only
the glyph survives, stripped of its fill so it inherits `currentColor`. That is
the property everything else leans on — the rarity colour that lights a slot's
border lights its icon in the same assignment.

**It validates every name against the real icon index before fetching anything**,
and prints the correct path for each miss. This is not ceremony: 36 of the first
116 names were wrong, nearly all of them the right icon filed under a different
author, and a name that does not exist renders as nothing at all rather than as
an error. Fetches are cached in `tools/art/.icon-cache/` (gitignored).

`tools/test/icons.mjs` is the other half — it asserts that every key the game
names exists in the baked set. Run it after any icon change.

### src/

Source frames, not generated:

- `src/0x72/` — 84 frames from 0x72's "16x16 DungeonTileset II" (CC0)
- `src/custom/` — 8 hand-drawn frames (slime, wolf) from `make_custom_sprites.ps1`

Provenance and licences: `client/public/assets/ASSET_CREDITS.txt`.

### Verifying a change

The generators are deterministic. Re-running them without editing anything
reproduces the committed PNGs byte for byte, so `git status` staying clean is
the check that you haven't broken one.

## test/

**Still valid after the 3D rewrite** — it drives the server over a real socket
and the server did not change, so it tests exactly what it always did.

`talents.mjs` — no server needed. Checks the eight weapon talent trees: every
granted skill exists, every prerequisite is in the same tree and an earlier
tier, no node is inert, no skill is stranded outside every tree, each tree can
be walked from level 1 to the cap without the points getting stuck, and — the
one that has already earned it — that a tree does NOT fit inside its own point
budget, because a tree you can buy entirely is a checklist.

```powershell
node tools/test/talents.mjs
```

`bodies.mjs` — no server needed, pure arithmetic over the shared rules. Asserts
the two invariants that make body collision safe: every weapon reaches past
every body, and every monster reaches back. Break either by nudging a radius
and melee against that one kind stops working with no error at all, which is
why it is a test rather than a matter of judgement.

```powershell
node tools/test/bodies.mjs
```

`bag.mjs` — no server needed. Checks the one rule the bag and the server
share: what counts as the same kind of thing, how many cells a pile of them
takes, and whether one more fits. The client draws cells and the server counts
cells to decide whether a drop is accepted, so if the two ever compute
different numbers the symptom is a drop vanishing into a bag with visible
space in it — which nothing throws on.

```powershell
node tools/test/bag.mjs
```

`../patch.mjs` — not a test. Applies a batch of exact-string edits from a JSON
spec, normalising line endings for the match and restoring the file's own on
write. Source files here are a mix of CRLF and LF (`core.autocrlf=true`), so a
multi-line find-and-replace silently matches nothing on half of them. It aborts
the WHOLE batch if any edit does not match exactly once and says how many were
dropped — a patch script that half-applies is worse than one that does not apply
at all, and this repo has lost three edits that way before.

```powershell
node tools/patch.mjs edits.json   # [{ file, find, replace }, ...]
```

`schools.mjs` — no server needed. Checks the damage schools: that no resistance
is ever an immunity (the cap is enforced on read, not merely authored inside),
that every element has something dealing it, something resisting it and
something folding to it, that every boss has an answer a player can actually
reach, and — the section that can fail when all the others pass — 4,000 rolls
through the real resolver proving the numbers move and that resistance is
applied before armour.

It is the one suite that has already rewritten the design it tests: its first
run failed with nothing weak to physical, nothing weak to nature, and nothing
resisting arcane or lightning, so the bestiary was changed rather than the
check. None of those failures throws, and none is visible in a screenshot.

```powershell
node tools/test/schools.mjs
```

`statuses.mjs` — no server needed. Checks the buff/debuff table: that every
status does something, that a buff carries no penalty and a debuff no benefit,
that every modifier key is one the stat sheet actually reads, that no pile of
slows composes into a root and no pile of marks into a one-shot, that every
status has a source and every source can actually land it on what it targets,
and that every weapon tree got one.

The failures are silent to a fault. A self-buff aimed at a monster spends its
cooldown and does nothing; a status nothing applies is a row no player will
ever see; a modifier using a key outside `PassiveBonus` is the exact bug helm
and cape shipped with for a year.

```powershell
node tools/test/statuses.mjs
```

`icons.mjs` — no server needed. Checks that every icon key the game names — the
class, weapon, default-attack and skill tables, all 73 talent nodes, plus the
slots, materials, consumables, dock and attribute keys the panels name directly
— exists in the baked set, and reports any icon baked but never referenced. The
failure it exists for is silent: a mistyped key draws nothing, so the
alternative is hunting for blank squares across four panels by eye.

```powershell
node tools/test/icons.mjs
```

`smoke.mjs` — drives a real WebSocket client against a running server. Logs in,
crafts and equips a weapon of each family, and asserts that class, mana pool and
appearance follow the weapon. Also equips each visible gear slot and checks it
reaches the appearance layers other clients draw from.

```powershell
npm run dev          # in another terminal
node tools/test/smoke.mjs mybotname
```

It needs materials to craft with. A fresh character gets a daily bonus that
covers roughly one common recipe; for a full sweep, top the character up:

```powershell
node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync('server/data/wieldbound.db').prepare('UPDATE characters SET wood=4000,ore=4000,herb=4000 WHERE name=?').run('mybotname')"
```

`town.mjs` — no server needed, pure geometry over `shared/town.ts`. Checks
Emberhold's layout: that no two buildings overlap (separating-axis, against
their real oriented footprints), that the square is genuinely clear around the
anvil, that both roads leave through open ground, that nobody is standing in a
wall, that the pushout evicts every interior sample without flinging anyone
across town, that the palisade stops short of the nearest monster body, and
that every node ring the server seeds is outside the walls and inside the
world.

It has already rewritten the town three times. The first layout put seven
buildings on too tight a ring and it refused all of it — three overlapping
pairs and three roads running into walls — which is what forced the change from
four gates to one through-road. None of those failures throws, and a building
standing on a road is not visible from any single screenshot.

```powershell
node tools/test/town.mjs
```

`quests.mjs` — no server needed. Checks the shop and the work: that every shop
line names something real, that nothing past band 2 is on sale, that buying
always costs more in total than forging the same item (or the anvil is
decoration), that a first weapon is reachable in one session, that every quest
names a monster and a resource that exist, that the chain has no cycle and
nothing is stranded, and that the level gates never run ahead of what the
quests before them pay.

Plus the section that guards the Herald's line, where every failure is the game
teaching a lie **in its own voice**: that every element a quest names is a real
WEAKNESS in `MONSTER_STATS` rather than something the creature shrugs off, that
there is a way in the catalogue or the skill tables to deal it at all (nature has
exactly one weapon and it is band 5, so this is live rather than hypothetical),
that the brief names its own element as a whole word, and that each of the five
elements has exactly one quest — so an element added later without work behind it
fails here instead of going quiet.

```powershell
node tools/test/quests.mjs
```

`slaying.mjs` — drives a real socket, like `smoke.mjs`, and tests the one part of
the `slay` objective no offline suite can reach: the JOIN between every damage
path recording what it was made of and `awardKill` reading the right player's row
before `clearThreat` wipes it. It takes the Herald's frost quest, fights the same
camp twice with two different weapons, and asserts that one phase can move the
counter and the other cannot. Measured: twenty-four armabees killed with
lightning move it by nothing, twenty-four with frost fill it.

It asserts the SIGN of the change rather than a count, and that is the second
version — the first asserted "+1 per kill" and failed against a working game,
because this is an auto-battler and a phase kills however many it kills.

```powershell
node tools/seed.mjs Slayer --level 40   # server stopped
node tools/quests-reset.mjs Slayer      # server stopped, if run before
npm run dev:server
node tools/test/slaying.mjs Slayer
```

`../quests-reset.mjs` — not a test. Clears one character's quest rows so
`slaying.mjs` can run again; a counter that is already full does not move, which
reads exactly like the feature being broken. Same constraint as `seed.mjs`: the
server holds the database, so stop it first.

`road.mjs` — no server needed. Walks the smoothed North Road and checks the one
thing it exists for: that following it gets you from the palisade to the
frontier without a fight. That is a claim about distance from four monster camps
over four kilometres of curve, which nobody can eyeball and which fails
silently — a road clipping a wolf pack's aggro looks completely correct and is a
journey that cannot be made. Also that it leaves by a real gateway, ends at the
town site, never doubles back, keeps its full width clear of buildings, and that
the torches are spaced ALONG the curve rather than by index (which would bunch
them on the bends, exactly where a traveller needs to see where the road goes).

```powershell
node tools/test/road.mjs
```

`river.mjs` — no server needed. The Coldwater's property is a claim about the
whole map rather than about the water: the frontier north of it is reachable at
one point and that point is on the road. Every failure mode of that is silent. A
course stopping at the world edge leaves a way round it that nothing on screen
shows. A bridge derived from the wrong intersection stands in a field. A
collision pushing to the wrong bank teleports a traveller back where they came
from, once, on a bend. It also checks the fast bucketed distance query against a
full polyline walk at every probe, because an optimisation that is occasionally
wrong is worse than none — it would be wrong in a few places, on a curve nobody
is going to check by eye.

```powershell
node tools/test/river.mjs
```

`forests.mjs` — no server needed. Mostly one rule, and it is the rule that made
forests possible at all: the harvestable wood node is a round-crowned broadleaf
and nothing else in the world may wear that silhouette. It reads `NODE_MODELS`,
the forest species table and the treeline out of the real source files rather
than restating them, and fails if the two sets ever intersect or if a forest
tree can be as short as a node. Nothing in the engine keeps those arrays apart
and the symptom of them meeting is a player quietly learning to click on
scenery. Plus: every wood past the last monster camp, no camp or node or
waystone under canopy, an outline ragged enough not to be a disc, the road
running through at least one wood, and every name coming back out of
`placeNameAt` while most of the map stays nameless.

```powershell
node tools/test/forests.mjs
```

`wind.mjs` — no server needed. Fourteen lines of arithmetic that drive every
blade of grass in the world, which is exactly the combination that goes wrong
quietly. Checks that the strength never touches zero (dead calm reads as the
animation having broken) and never jolts between frames; that the field does not
repeat one game-day later, which is the difference between weather and an
animation loop; that the direction veers rather than swinging; and — the section
that exists because of a real bug — that the phase FITS IN A FLOAT32. Built
straight from Date.now() it was 2.9 billion, where float32 spacing is 256, so
the wind stood still for minutes and then jumped. It also reads the real sway
tables out of the client and fails if one is authored off the step the seamless
wrap depends on.

```powershell
node tools/test/wind.mjs
```

`ground.mjs` — no server needed. Enforces the rule this project has now
re-learned four times: anything that lies on the ground has to lie on the ground
you can SEE. There are two ways to get it wrong — reading `terrainHeight`, the
smooth analytic field, when the drawn mesh rides above it across a quarter of the
world; and using no datum at all, which is what five skill shapes were doing with
a literal `y = 0` since before the ground had relief.

A source test, because Node cannot import anything that pulls in three.js and the
failure is a call site reading the wrong name. It lists who MUST read
`surfaceHeight` and who MAY read `terrainHeight` **with a reason each** — a
dragonfly over the Coldwater belongs over the water and not over the bridge deck,
and a rooted plant slightly under the mesh is what rooted looks like — so
reaching for the smooth field means arguing here rather than in a diff.

It also asserts the rule is LOAD-BEARING, which is what keeps the rest honest:
every check is vacuous if the two height functions agree, so the gap is measured
and the suite fails if it ever closes. Plus the flat/tilted/per-vertex burial
table, so "simplifying" the rings back to a tilted quad fails loudly instead of
quietly re-burying the slam telegraph.

```powershell
node tools/test/ground.mjs
```

`rng.mjs` — no server needed, and the most important twenty lines in this
directory. The seeded generator was the textbook C LCG copy-pasted into six
files, and in JavaScript `s * 1103515245` overflows a double before the mask
runs, so the sequence had **11,064 distinct values**. It passed every obvious
check — deterministic, fast, and a histogram flat to within one per cent — while
placing eighty-two thousand plants on about five thousand positions. So this
test asserts the properties that FAILED rather than the ones that are easy to
write: period, and pair coverage over a grid, because positions are drawn two at
a time and a generator can have a long period and still walk a lattice.

```powershell
node tools/test/rng.mjs
```
