# tools

Build-time tooling. None of this runs at game time — it produces the PNGs and
WAVs in `client/public/assets/`, which are committed. You only need this if you
want to *change* an asset.

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
| `build_sfx.ps1` | `assets/sfx/*.wav` | 10 cues synthesised as 16-bit WAVs — no samples, just arithmetic |
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
