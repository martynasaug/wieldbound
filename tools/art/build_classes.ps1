# Builds actors.png and weapons.png for the class system.
#
# ACTORS: 16 rows x 8 frames (idle f0-3, run f0-3), 32x36 cells, bottom
# aligned. Rows 0-11 are the three player classes at four armour tiers,
# 12-15 the monsters.
#
# Each class keeps its own colour identity across tiers rather than every
# class converging on the same "gold = best" ramp: a warrior tiers through
# metals, a ranger through leathers and greens, a mage through robe dyes.
# Tier is still readable at a glance, but so is class, which matters far
# more in a crowd. Every source sprite happens to use exactly two colours
# for its garment, which is what makes a palette swap sufficient.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"


$CELL_W = 32
$CELL_H = 36
$COLS = 8

# class -> the two garment tones in its source art, then the ramp per tier
$classes = @(
  @{
    id = "warrior"; key = "knight_m"
    light = "114,214,206"; dark = "65,112,137"
    tiers = @(
      @{ name = "none"; l = @(146, 150, 158); d = @(84, 88, 98) }      # plain iron
      @{ name = "common"; l = @(198, 140, 76); d = @(122, 78, 42) }    # bronze
      @{ name = "rare"; l = @(206, 216, 230); d = @(108, 124, 148) }   # steel
      @{ name = "epic"; l = @(247, 206, 96); d = @(158, 116, 38) }     # gold
    )
  },
  @{
    id = "ranger"; key = "elf_m"
    light = "75,167,71"; dark = "61,115,79"
    tiers = @(
      @{ name = "none"; l = @(150, 116, 78); d = @(94, 68, 44) }       # rough leather
      @{ name = "common"; l = @(96, 142, 74); d = @(58, 88, 52) }      # forest green
      @{ name = "rare"; l = @(72, 176, 138); d = @(40, 104, 88) }      # teal
      @{ name = "epic"; l = @(120, 224, 150); d = @(46, 138, 96) }     # emerald
    )
  },
  @{
    id = "mage"; key = "wizzard_m"
    light = "86,152,204"; dark = "89,86,189"
    tiers = @(
      @{ name = "none"; l = @(150, 150, 162); d = @(96, 96, 112) }     # undyed
      @{ name = "common"; l = @(96, 150, 210); d = @(58, 92, 158) }    # blue
      @{ name = "rare"; l = @(158, 116, 220); d = @(96, 62, 170) }     # violet
      @{ name = "epic"; l = @(236, 178, 88); d = @(150, 82, 176) }     # gold-violet
    )
  }
)

$monsters = @(
  @{ name = "slime"; src = "custom"; key = "slime" },
  @{ name = "goblin"; src = "dungeon"; key = "orc_warrior" },
  @{ name = "wolf"; src = "custom"; key = "wolf" },
  @{ name = "troll"; src = "dungeon"; key = "ogre" }
)

function Recolor([string]$file, [string]$lightKey, [string]$darkKey, $lightRgb, $darkRgb) {
  $src = [System.Drawing.Bitmap]::FromFile($file)
  $out = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
      $p = $src.GetPixel($x, $y)
      if ($p.A -eq 0 -or $null -eq $lightRgb) { $out.SetPixel($x, $y, $p); continue }
      $k = "{0},{1},{2}" -f $p.R, $p.G, $p.B
      if ($k -eq $lightKey) { $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, $lightRgb[0], $lightRgb[1], $lightRgb[2])) }
      elseif ($k -eq $darkKey) { $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, $darkRgb[0], $darkRgb[1], $darkRgb[2])) }
      else { $out.SetPixel($x, $y, $p) }
    }
  }
  $src.Dispose()
  return $out
}

$rows = @()
foreach ($cls in $classes) {
  foreach ($tier in $cls.tiers) {
    $rows += @{ label = "$($cls.id)-$($tier.name)"; src = "dungeon"; key = $cls.key
      lightKey = $cls.light; darkKey = $cls.dark; l = $tier.l; d = $tier.d }
  }
}
foreach ($m in $monsters) { $rows += @{ label = $m.name; src = $m.src; key = $m.key } }

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
      $anim = if ($c -lt 4) { "idle" } else { "run" }
      $file = Join-Path $dl ("{0}_{1}_anim_f{2}.png" -f $row.key, $anim, $idx)
    }
    else {
      $file = Join-Path $custom ("{0}_f{1}.png" -f $row.key, $idx)
    }
    if (-not (Test-Path $file)) { throw "missing frame: $file" }
    $b = Recolor $file $row.lightKey $row.darkKey $row.l $row.d
    $dx = $c * $CELL_W + [int](($CELL_W - $b.Width) / 2)
    $dy = $r * $CELL_H + ($CELL_H - $b.Height)
    $g.DrawImage($b, (New-Object System.Drawing.Rectangle($dx, $dy, $b.Width, $b.Height)))
    $artH = $b.Height
    $b.Dispose()
  }
  "row {0,2}  {1,-16} artH={2}" -f $r, $row.label, $artH
}
$g.Dispose()
$sheet.Save((Join-Path $assets "actors.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"saved actors.png ({0}x{1}, {2} rows)" -f $sheetW, $sheetH, $rows.Count
""

# ---------------------------------------------------------------- weapons
# Three families of three tiers, so a class always sees its own weapon type
# escalate. The epic bow and staff are tinted variants: the pack has only
# two bows and two staffs, and inventing a third from scratch would look
# out of place beside art it has to sit next to.
function TintCopy([string]$file, $mul) {
  $src = [System.Drawing.Bitmap]::FromFile($file)
  $out = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
      $p = $src.GetPixel($x, $y)
      if ($p.A -eq 0) { $out.SetPixel($x, $y, $p); continue }
      $nr = [Math]::Min(255, [int]($p.R * $mul[0]))
      $ng = [Math]::Min(255, [int]($p.G * $mul[1]))
      $nb = [Math]::Min(255, [int]($p.B * $mul[2]))
      $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, $nr, $ng, $nb))
    }
  }
  $src.Dispose()
  return $out
}

$W_W = 16; $W_H = 40
$weaponCells = @(
  @{ n = "sword_common"; f = "weapon_rusty_sword" },
  @{ n = "sword_rare"; f = "weapon_red_gem_sword" },
  @{ n = "sword_epic"; f = "weapon_golden_sword" },
  @{ n = "bow_common"; f = "weapon_bow" },
  @{ n = "bow_rare"; f = "weapon_bow_2" },
  @{ n = "bow_epic"; f = "weapon_bow_2"; tint = @(1.35, 1.12, 0.55) },
  @{ n = "staff_common"; f = "weapon_green_magic_staff" },
  @{ n = "staff_rare"; f = "weapon_red_magic_staff" },
  @{ n = "staff_epic"; f = "weapon_green_magic_staff"; tint = @(1.45, 1.15, 0.6) },
  @{ n = "axe_goblin"; f = "weapon_axe" }
)

$wSheet = New-Object System.Drawing.Bitmap(($weaponCells.Count * $W_W), $W_H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$wg = [System.Drawing.Graphics]::FromImage($wSheet)
$wg.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$wg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$wg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
for ($i = 0; $i -lt $weaponCells.Count; $i++) {
  $cell = $weaponCells[$i]
  $path = Join-Path $dl ($cell.f + ".png")
  $b = if ($cell.ContainsKey("tint")) { TintCopy $path $cell.tint } else { [System.Drawing.Bitmap]::FromFile($path) }
  $dx = $i * $W_W + [int](($W_W - $b.Width) / 2)
  $dy = $W_H - $b.Height
  $wg.DrawImage($b, (New-Object System.Drawing.Rectangle($dx, $dy, $b.Width, $b.Height)))
  "weapon {0}  {1,-14} {2}x{3}" -f $i, $cell.n, $b.Width, $b.Height
  $b.Dispose()
}
$wg.Dispose()
$wSheet.Save((Join-Path $assets "weapons.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$wSheet.Dispose()
"saved weapons.png ({0}x{1})" -f ($weaponCells.Count * $W_W), $W_H
