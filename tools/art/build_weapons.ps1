# Rebuilds weapons.png: seven families x three rarities, plus the goblin axe.
#
# Every cell is 16x40 and BOTTOM-ALIGNED, because the runtime sets
# origin (0.5, gripY) and rotates the sprite to swing it. Each family declares
# where the hand actually closes on it (see GRIPS below and
# WEAPON_GRIP_FROM_BOTTOM in WorldScene) - a sword is held at the pommel, a bow
# at its middle, a staff a third of the way up. Using one pivot for all of them
# is what previously made bows and staves float above the wielder's head.
#
# Art is drawn point-up / hilt-down so that a single rotation tween reads as a
# real swing without needing per-family animation.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"

$CELL_W = 16
$CELL_H = 40

function C([int]$r, [int]$g, [int]$b) { return [System.Drawing.Color]::FromArgb(255, $r, $g, $b) }
$CLEAR = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
$OUTLINE = (C 26 22 26)

# Per-rarity metal and accent: common iron, rare a blued steel, epic a gold-lit
# arcane alloy - readable at 3x zoom without needing a glow layer.
#
# Named PALETTES rather than TIER on purpose. PowerShell variable names are
# case-insensitive, so a $TIER array and the $tier loop counter further down
# would be the SAME variable, and the loop would silently overwrite the
# palettes with an integer.
$PALETTES = @(
  @{ n = "common"; metal = (C 176 182 194); metalDk = (C 108 116 130); wood = (C 122 84 48); woodDk = (C 78 52 30); gem = (C 208 172 92); accent = (C 150 120 70) },
  @{ n = "rare"; metal = (C 150 196 224); metalDk = (C 84 124 160); wood = (C 96 74 100); woodDk = (C 60 44 66); gem = (C 90 170 240); accent = (C 190 210 240) },
  @{ n = "epic"; metal = (C 236 214 150); metalDk = (C 176 138 62); wood = (C 74 56 92); woodDk = (C 46 34 58); gem = (C 210 110 240); accent = (C 250 230 160) }
)

function NewCell { return New-Object System.Drawing.Bitmap($CELL_W, $CELL_H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb) }
function Px($b, [int]$x, [int]$y, $c) {
  if ($x -lt 0 -or $y -lt 0 -or $x -ge $script:CELL_W -or $y -ge $script:CELL_H) { return }
  $b.SetPixel($x, $y, $c)
}
function Rect($b, [int]$x0, [int]$y0, [int]$x1, [int]$y1, $c) {
  for ($y = $y0; $y -le $y1; $y++) { for ($x = $x0; $x -le $x1; $x++) { Px $b $x $y $c } }
}
function Outline($b, $c) {
  $solid = New-Object 'bool[,]' $script:CELL_W, $script:CELL_H
  for ($y = 0; $y -lt $CELL_H; $y++) { for ($x = 0; $x -lt $CELL_W; $x++) { $solid[$x, $y] = ($b.GetPixel($x, $y).A -gt 0) } }
  for ($y = 0; $y -lt $CELL_H; $y++) {
    for ($x = 0; $x -lt $CELL_W; $x++) {
      if ($solid[$x, $y]) { continue }
      $t = $false
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $nx = $x + $d[0]; $ny = $y + $d[1]
        if ($nx -ge 0 -and $nx -lt $CELL_W -and $ny -ge 0 -and $ny -lt $CELL_H -and $solid[$nx, $ny]) { $t = $true }
      }
      if ($t) { $b.SetPixel($x, $y, $c) }
    }
  }
}

# Every family draws upward from the bottom of the cell. $len grows with tier
# so an epic reads as bigger, but stays under the wielder's height - oversized
# blades were what made rare/epic swords look like they were being carried
# overhead rather than held.
function DrawSword($b, $t, [int]$tier) {
  $len = 15 + $tier * 3
  $top = $CELL_H - 1 - $len
  Rect $b 7 $top 8 ($CELL_H - 6) $t.metal      # blade
  Rect $b 7 $top 7 ($CELL_H - 6) $t.metalDk    # blade shadow edge
  Px $b 7 $top $CLEAR                          # taper the point
  Rect $b 4 ($CELL_H - 6) 11 ($CELL_H - 5) $t.accent   # crossguard
  Rect $b 7 ($CELL_H - 4) 8 ($CELL_H - 2) $t.wood      # grip
  Rect $b 6 ($CELL_H - 1) 9 ($CELL_H - 1) $t.accent    # pommel
}

function DrawDagger($b, $t, [int]$tier) {
  $len = 9 + $tier * 2
  $top = $CELL_H - 1 - $len
  Rect $b 7 $top 8 ($CELL_H - 5) $t.metal
  Rect $b 7 $top 7 ($CELL_H - 5) $t.metalDk
  Px $b 7 $top $CLEAR
  Rect $b 5 ($CELL_H - 5) 10 ($CELL_H - 5) $t.accent
  Rect $b 7 ($CELL_H - 4) 8 ($CELL_H - 1) $t.wood
}

function DrawAxe($b, $t, [int]$tier) {
  $len = 17 + $tier * 2
  $top = $CELL_H - 1 - $len
  Rect $b 7 $top 8 ($CELL_H - 1) $t.wood       # haft runs the full length
  Rect $b 7 $top 7 ($CELL_H - 1) $t.woodDk
  # Head: a wedge, narrow where it meets the haft and flaring to a curved
  # cutting edge. A plain rectangle here just read as a block on a stick.
  $hy = $top + 2
  $profile = @(2, 4, 5, 5, 4, 2)               # how far the head reaches out
  for ($i = 0; $i -lt $profile.Count; $i++) {
    $w = $profile[$i] + $tier
    Rect $b 9 ($hy + $i) (8 + $w) ($hy + $i) $t.metal
    Px $b (8 + $w) ($hy + $i) $t.metalDk       # darker along the cutting edge
  }
  Rect $b 5 ($hy + 2) 6 ($hy + 3) $t.metalDk   # small back spike
}

function DrawMace($b, $t, [int]$tier) {
  $len = 15 + $tier * 2
  $top = $CELL_H - 1 - $len
  Rect $b 7 ($top + 6) 8 ($CELL_H - 1) $t.wood
  Rect $b 7 ($top + 6) 7 ($CELL_H - 1) $t.woodDk
  # blocky head with flanges
  Rect $b 5 $top 10 ($top + 6) $t.metal
  Rect $b 5 $top 5 ($top + 6) $t.metalDk
  Rect $b 4 ($top + 2) 11 ($top + 4) $t.metal
  Rect $b 4 ($top + 4) 11 ($top + 4) $t.metalDk
  Px $b 7 ($top + 3) $t.gem
  Px $b 8 ($top + 3) $t.gem
}

function DrawBow($b, $t, [int]$tier) {
  $len = 21 + $tier * 3
  $top = [int](($CELL_H - $len) / 2) + 6
  $bot = $top + $len
  # limbs curve away from the string, which runs straight down the middle
  for ($y = $top; $y -le $bot; $y++) {
    $f = ($y - $top) / [double]$len          # 0..1 along the bow
    $bulge = [int]([Math]::Sin($f * [Math]::PI) * 4)
    Px $b (9 + $bulge) $y $t.wood
    Px $b (10 + $bulge) $y $t.woodDk
  }
  Rect $b 8 $top 8 $bot $t.accent            # string
  Rect $b 9 ($top + [int]($len / 2) - 1) 10 ($top + [int]($len / 2) + 1) $t.metalDk  # grip wrap
}

function DrawStaff($b, $t, [int]$tier) {
  $len = 26 + $tier * 3
  $top = $CELL_H - 1 - $len
  Rect $b 7 ($top + 5) 8 ($CELL_H - 1) $t.wood
  Rect $b 7 ($top + 5) 7 ($CELL_H - 1) $t.woodDk
  # An OPEN crook: two prongs curling up around a floating focus stone. The
  # earlier version closed the top with a crossbar, which turned the whole
  # thing into a box on a pole rather than something cradling a gem.
  Rect $b 4 ($top + 2) 5 ($top + 7) $t.woodDk
  Rect $b 10 ($top + 2) 11 ($top + 7) $t.wood
  Px $b 5 ($top + 1) $t.woodDk                 # prong tips curl inward
  Px $b 10 ($top + 1) $t.wood
  # focus stone, floating clear of both prongs
  Rect $b 7 ($top + 2) 8 ($top + 6) $t.gem
  Rect $b 6 ($top + 3) 9 ($top + 5) $t.gem
  Px $b 7 ($top + 3) $t.accent                 # highlight
  Px $b 8 ($top + 6) $t.accent
}

function DrawWand($b, $t, [int]$tier) {
  $len = 11 + $tier * 2
  $top = $CELL_H - 1 - $len
  Rect $b 7 ($top + 3) 8 ($CELL_H - 1) $t.wood
  Rect $b 7 ($top + 3) 7 ($CELL_H - 1) $t.woodDk
  Rect $b 6 $top 9 ($top + 3) $t.gem
  Px $b 6 $top $CLEAR
  Px $b 9 $top $CLEAR
  Px $b 7 ($top + 1) $t.accent
  # a couple of loose sparks so it reads as arcane rather than a short stick
  Px $b 4 ($top + 1) $t.accent
  Px $b 11 ($top + 4) $t.accent
}

# The goblin's chopper: crude, iron, no tier variation.
function DrawGoblinAxe($b) {
  $wood = (C 96 68 40); $woodDk = (C 62 42 24)
  $metal = (C 150 156 166); $metalDk = (C 92 98 110)
  Rect $b 7 20 8 39 $wood
  Rect $b 7 20 7 39 $woodDk
  Rect $b 9 21 12 26 $metal
  Rect $b 9 26 12 26 $metalDk
  Px $b 12 21 $CLEAR
  Rect $b 5 21 6 24 $metalDk
}

# --- layout ---------------------------------------------------------------
# Order here IS the frame index in WEAPON_FRAME. Families are contiguous and
# tiers ascend within a family, so the client's table stays three consecutive
# numbers per family rather than a scattered lookup.
$families = @(
  @{ n = "sword"; fn = "DrawSword" },
  @{ n = "axe"; fn = "DrawAxe" },
  @{ n = "mace"; fn = "DrawMace" },
  @{ n = "dagger"; fn = "DrawDagger" },
  @{ n = "bow"; fn = "DrawBow" },
  @{ n = "staff"; fn = "DrawStaff" },
  @{ n = "wand"; fn = "DrawWand" }
)

$cells = $families.Count * 3 + 1
$sheet = New-Object System.Drawing.Bitmap(($cells * $CELL_W), $CELL_H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear($CLEAR)

$idx = 0
foreach ($fam in $families) {
  for ($tier = 0; $tier -lt 3; $tier++) {
    $cell = NewCell
    & $fam.fn $cell $PALETTES[$tier] $tier
    Outline $cell $OUTLINE
    $g.DrawImage($cell, (New-Object System.Drawing.Rectangle(($idx * $CELL_W), 0, $CELL_W, $CELL_H)))
    $cell.Dispose()
    "  {0,2}  {1}-{2}" -f $idx, $fam.n, $PALETTES[$tier].n
    $idx++
  }
}
$cell = NewCell
DrawGoblinAxe $cell
Outline $cell $OUTLINE
$g.DrawImage($cell, (New-Object System.Drawing.Rectangle(($idx * $CELL_W), 0, $CELL_W, $CELL_H)))
$cell.Dispose()
"  {0,2}  goblin-axe" -f $idx

$g.Dispose()
$sheet.Save((Join-Path $assets "weapons.png"), [System.Drawing.Imaging.ImageFormat]::Png)
"saved weapons.png ({0}x{1}), {2} cells" -f ($cells * $CELL_W), $CELL_H, $cells
$sheet.Dispose()
