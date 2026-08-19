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
