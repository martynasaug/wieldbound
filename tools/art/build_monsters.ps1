# Rebuilds actors.png as MONSTERS ONLY: 4 rows x 8 frames (idle f0-3, run
# f0-3), 32x36 cells, bottom aligned.
#
# It used to also carry 12 player rows - three classes at four armour tiers,
# each a palette swap of the same source sprite. That scheme cannot express
# the current model: class now comes from whichever weapon you are holding
# and can change mid-fight, and helm/chest/cape/boots vary independently, so
# a baked row per combination is combinatorially hopeless. Players are drawn
# from body.png + gear.png instead (see build_paperdoll.ps1), which leaves
# this sheet holding only things whose look never varies.
#
# Deliberately NOT a flag on build_classes.ps1: that script also rebuilds
# weapons.png from the old three-family layout, and running it now would
# clobber the seven-family sheet build_weapons.ps1 produces.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"

# Source frames still live in the previous session's scratchpad - they are
# the downloaded 0x72 pack and the two hand-drawn creatures, not generated.


$CELL_W = 32
$CELL_H = 36
$COLS = 8

# Order here IS the row index in ACTOR_ROW in WorldScene.
$rows = @(
  @{ label = "slime"; src = "custom"; key = "slime" },
  @{ label = "goblin"; src = "dungeon"; key = "orc_warrior" },
  @{ label = "wolf"; src = "custom"; key = "wolf" },
  @{ label = "troll"; src = "dungeon"; key = "ogre" }
)

$sheetW = $COLS * $CELL_W
$sheetH = $rows.Count * $CELL_H
$sheet = New-Object System.Drawing.Bitmap($sheetW, $sheetH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

for ($r = 0; $r -lt $rows.Count; $r++) {
  $row = $rows[$r]
  $artH = 0
  for ($c = 0; $c -lt $COLS; $c++) {
    $idx = $c % 4
    if ($row.src -eq "dungeon") {
      # The pack ships separate idle and run animations; the custom sprites
      # have one 4-frame loop reused for both.
      $anim = if ($c -lt 4) { "idle" } else { "run" }
      $file = Join-Path $dl ("{0}_{1}_anim_f{2}.png" -f $row.key, $anim, $idx)
    }
    else {
      $file = Join-Path $custom ("{0}_f{1}.png" -f $row.key, $idx)
    }
    if (-not (Test-Path $file)) { throw "missing frame: $file" }
    $b = [System.Drawing.Bitmap]::FromFile($file)
    # Centred horizontally, bottom-aligned vertically, so setOrigin(0.5, 1)
    # stands every actor feet-on-position whatever its source frame size.
    $dx = $c * $CELL_W + [int](($CELL_W - $b.Width) / 2)
    $dy = $r * $CELL_H + ($CELL_H - $b.Height)
    $g.DrawImage($b, (New-Object System.Drawing.Rectangle($dx, $dy, $b.Width, $b.Height)))
    $artH = $b.Height
    $b.Dispose()
  }
  "row {0}  {1,-8} artH={2}" -f $r, $row.label, $artH
}
$g.Dispose()
$sheet.Save((Join-Path $assets "actors.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"saved actors.png ({0}x{1}, {2} rows)" -f $sheetW, $sheetH, $rows.Count
