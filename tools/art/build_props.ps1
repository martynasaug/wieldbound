# Builds client/public/assets/props.png — every world object that isn't an
# actor, normalised into one 32x32 grid indexed 0..N.
#
# Two reasons this exists rather than indexing tiles.png directly:
#  1) The terrain sheet is addressed as `row * 57 + col`, and getting those
#     two the wrong way round silently yields a valid-but-wrong tile (the
#     crafting station shipped as a blinking blue flower this way).
#     A flat 0..N index has no such failure mode.
#  2) The good trees in that sheet are TWO tiles tall, split across rows,
#     which a single frame index cannot express at all.
#
# Every cell is horizontally centred and bottom-aligned, matching actors.png,
# so setOrigin(0.5, 1) means "base sits on the world position" everywhere.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"

$tilesPath = Join-Path $assets "tiles.png"
$outPath = Join-Path $assets "props.png"

$CELL_SIZE = 32
$STRIDE = 17  # 16px tile + 1px gap in the Kenney sheet

# ---------------------------------------------------------------- helpers
$M_EMPTY = 0; $M_BODY = 1; $M_LIGHT = 2; $M_DARK = 3; $M_SHINE = 4; $M_MOSS = 5

function New-Grid([int]$w, [int]$h) {
  $g = New-Object 'int[,]' $w, $h
  return , $g
}
function Fill-Ellipse([int[,]]$grid, [int]$w, [int]$h, [double]$cx, [double]$cy, [double]$rx, [double]$ry, [int]$mat) {
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $dx = ($x + 0.5 - $cx) / $rx
      $dy = ($y + 0.5 - $cy) / $ry
      if (($dx * $dx + $dy * $dy) -le 1.0) { $grid[$x, $y] = $mat }
    }
  }
}
function Fill-Rect([int[,]]$grid, [int]$w, [int]$h, [int]$x0, [int]$y0, [int]$x1, [int]$y1, [int]$mat) {
  for ($y = $y0; $y -le $y1; $y++) {
    for ($x = $x0; $x -le $x1; $x++) {
      if ($x -ge 0 -and $x -lt $w -and $y -ge 0 -and $y -lt $h) { $grid[$x, $y] = $mat }
    }
  }
}
function C([int]$r, [int]$g, [int]$b) { return [System.Drawing.Color]::FromArgb(255, $r, $g, $b) }

function Grid-ToBitmap([int[,]]$grid, [int]$w, [int]$h, $palette, $outlineColor) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $m = $grid[$x, $y]
      if ($m -ne $M_EMPTY) { $bmp.SetPixel($x, $y, $palette[$m]); continue }
      $touches = $false
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $nx = $x + $d[0]; $ny = $y + $d[1]
        if ($nx -ge 0 -and $nx -lt $w -and $ny -ge 0 -and $ny -lt $h) {
          if ($grid[$nx, $ny] -ne $M_EMPTY) { $touches = $true }
        }
      }
      if ($touches) { $bmp.SetPixel($x, $y, $outlineColor) } else { $bmp.SetPixel($x, $y, $clear) }
    }
  }
  return $bmp
}

# ------------------------------------------------------------------ rocks
# Cool grey with a warm bias so it reads as stone sitting in grass rather
# than a hole punched in the field.
$rockPal = @{}
$rockPal[$M_BODY] = C 139 144 153
$rockPal[$M_LIGHT] = C 184 188 196
$rockPal[$M_DARK] = C 90 97 110
$rockPal[$M_SHINE] = C 214 218 224
$rockPal[$M_MOSS] = C 106 142 62
$rockOutline = C 43 47 56

function New-Rock([double]$rx, [double]$ry, [int]$w, [int]$h, [bool]$withMoss) {
  $g = New-Grid $w $h
  $cx = $w / 2.0
  $cy = $h - $ry - 0.5
  Fill-Ellipse $g $w $h $cx $cy $rx $ry $M_BODY
  # Chip the silhouette so it is faceted stone, not a pebble-smooth egg.
  Fill-Rect $g $w $h 0 0 ([int]($cx - $rx * 0.35)) ([int]($cy - $ry * 0.45)) $M_EMPTY
  Fill-Ellipse $g $w $h ($cx + $rx * 0.55) ($cy - $ry * 0.30) ($rx * 0.42) ($ry * 0.42) $M_BODY
  # top-lit tone bands
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ($g[$x, $y] -eq $M_BODY) {
        if ($y -le [int]($cy - $ry * 0.45)) { $g[$x, $y] = $M_LIGHT }
        elseif ($y -ge [int]($cy + $ry * 0.35)) { $g[$x, $y] = $M_DARK }
      }
    }
  }
  # specular chip on the lit facet
  Fill-Ellipse $g $w $h ($cx - $rx * 0.30) ($cy - $ry * 0.50) ($rx * 0.22) ($ry * 0.20) $M_SHINE
  # a crack, drawn as two short dark steps
  $crackX = [int]($cx + $rx * 0.15)
  Fill-Rect $g $w $h $crackX ([int]$cy) $crackX ([int]($cy + $ry * 0.5)) $M_DARK
  Fill-Rect $g $w $h ($crackX + 1) ([int]($cy + $ry * 0.5)) ($crackX + 1) ([int]($cy + $ry * 0.7)) $M_DARK
  if ($withMoss) {
    Fill-Ellipse $g $w $h ($cx - $rx * 0.45) ($cy + $ry * 0.55) ($rx * 0.30) ($ry * 0.18) $M_MOSS
  }
  return Grid-ToBitmap $g $w $h $rockPal $rockOutline
}

$rockA = New-Rock 6.4 4.6 15 12 $true
$rockB = New-Rock 5.2 3.6 13 10 $false

# ---------------------------------------------------------------- details
# Ground clutter is drawn here rather than lifted from the tile sheet. The
# sheet's flower tiles bleed a stone-path fragment in from the neighbouring
# tile, and its white flowers are themselves grey, so no colour key can
# separate artwork from artifact. Drawing them also lets them be far
# subtler than the sheet's dense clumps — the field previously read as
# cluttered because each borrowed tile was a 5-blossom bouquet.
function New-Blank([int]$w, [int]$h) {
  return New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}
function Put([System.Drawing.Bitmap]$b, [int]$x, [int]$y, $col) {
  if ($x -ge 0 -and $y -ge 0 -and $x -lt $b.Width -and $y -lt $b.Height) { $b.SetPixel($x, $y, $col) }
}

# Blades of grass: no outline, two tones only. An outline at this size reads
# as an object sitting on the field instead of part of it.
function New-Tuft($blades) {
  $b = New-Blank 15 9
  $dark = C 92 138 38
  $tip = C 138 190 60
  foreach ($bl in $blades) {
    $x = $bl[0]; $hgt = $bl[1]; $lean = $bl[2]
    for ($i = 0; $i -lt $hgt; $i++) {
      $y = 8 - $i
      $xx = $x + [int]([Math]::Round($lean * $i / [double]$hgt))
      Put $b $xx $y $dark
    }
    $topY = 8 - $hgt + 1
    $topX = $x + [int]([Math]::Round($lean * ($hgt - 1) / [double]$hgt))
    Put $b $topX $topY $tip
  }
  return $b
}

function New-Flowers($petal, $centre, $spots) {
  $b = New-Blank 15 10
  $stem = C 92 138 38
  foreach ($s in $spots) {
    $x = $s[0]; $y = $s[1]
    for ($sy = $y + 2; $sy -le 9; $sy++) { Put $b $x $sy $stem }
    Put $b $x $y $petal
    Put $b ($x - 1) ($y + 1) $petal
    Put $b ($x + 1) ($y + 1) $petal
    Put $b $x ($y + 2) $petal
    Put $b $x ($y + 1) $centre
  }
  return $b
}

function New-Pebbles($spots) {
  $b = New-Blank 15 8
  $body = C 150 155 164
  $shade = C 96 103 116
  $edge = C 52 57 68
  foreach ($s in $spots) {
    $x = $s[0]; $y = $s[1]; $w = $s[2]
    for ($i = 0; $i -lt $w; $i++) {
      Put $b ($x + $i) $y $body
      Put $b ($x + $i) ($y + 1) $shade
    }
    Put $b ($x - 1) $y $edge
    Put $b ($x + $w) $y $edge
    for ($i = -1; $i -le $w; $i++) { Put $b ($x + $i) ($y + 2) $edge }
    Put $b $x ($y - 1) $edge
  }
  return $b
}

$tuftA = New-Tuft @(@(2, 5, -1), @(5, 7, 0), @(8, 4, 1), @(11, 6, -1))
$tuftB = New-Tuft @(@(3, 4, 1), @(6, 6, -1), @(9, 5, 0), @(12, 3, 1))
$flowerRed = New-Flowers (C 197 62 55) (C 255 209 92) @(@(3, 3), @(8, 4), @(12, 2))
$flowerWhite = New-Flowers (C 240 240 235) (C 255 201 66) @(@(4, 4), @(9, 2), @(12, 5))
$flowerBlue = New-Flowers (C 74 137 190) (C 255 231 138) @(@(2, 4), @(7, 2), @(11, 4))
$pebbles = New-Pebbles @(@(3, 4, 3), @(9, 5, 2))

# ------------------------------------------------------------------ atlas
$tiles = [System.Drawing.Bitmap]::FromFile($tilesPath)

# Each entry: list of {col,row,dx,dy} tile pieces, or a pre-made bitmap.
# Tall trees are two sheet rows stacked; the station is a forge beside an anvil.
$cells = @(
  @{ name = "tree_green"; pieces = @(@{ c = 15; r = 10; dx = 0; dy = 0 }, @{ c = 15; r = 11; dx = 0; dy = 16 }); w = 16; h = 32 },
  @{ name = "tree_autumn"; pieces = @(@{ c = 14; r = 10; dx = 0; dy = 0 }, @{ c = 14; r = 11; dx = 0; dy = 16 }); w = 16; h = 32 },
  @{ name = "tree_pine"; pieces = @(@{ c = 18; r = 10; dx = 0; dy = 0 }, @{ c = 18; r = 11; dx = 0; dy = 16 }); w = 16; h = 32 },
  @{ name = "bush_teal"; pieces = @(@{ c = 21; r = 9; dx = 0; dy = 0 }); w = 16; h = 16 },
  @{ name = "bush_amber"; pieces = @(@{ c = 20; r = 9; dx = 0; dy = 0 }); w = 16; h = 16 },
  @{ name = "rock_a"; bitmap = $rockA },
  @{ name = "rock_b"; bitmap = $rockB },
  @{ name = "station_a"; pieces = @(@{ c = 13; r = 0; dx = 0; dy = 0 }, @{ c = 15; r = 0; dx = 16; dy = 0 }); w = 32; h = 16 },
  @{ name = "station_b"; pieces = @(@{ c = 14; r = 0; dx = 0; dy = 0 }, @{ c = 15; r = 0; dx = 16; dy = 0 }); w = 32; h = 16 },
  # Ground clutter, drawn rather than borrowed (see New-Tuft above). Fully
  # transparent, so it composites over any grass shade — which is what frees
  # the grass texture below to carry tonal variation at all.
  @{ name = "tuft_a"; bitmap = $tuftA },
  @{ name = "tuft_b"; bitmap = $tuftB },
  @{ name = "flower_red"; bitmap = $flowerRed },
  @{ name = "flower_white"; bitmap = $flowerWhite },
  @{ name = "flower_blue"; bitmap = $flowerBlue },
  @{ name = "pebbles"; bitmap = $pebbles }
)

$sheetW = $cells.Count * $CELL_SIZE
$sheet = New-Object System.Drawing.Bitmap($sheetW, $CELL_SIZE, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

# Every flat-green tone the grass tiles are built from. Anything matching one
# of these inside a detail tile is background, not artwork.
$GRASS_TONES = @("123,173,44", "115,162,40", "136,189,50", "146,201,57")

# Lifts a 16x16 tile off the sheet, optionally dropping its grass background.
function Get-Tile([System.Drawing.Bitmap]$sheet, [int]$col, [int]$row, [bool]$keyGrass) {
  $out = New-Object System.Drawing.Bitmap(16, 16, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  $kept = 0
  for ($y = 0; $y -lt 16; $y++) {
    for ($x = 0; $x -lt 16; $x++) {
      $p = $sheet.GetPixel($col * $STRIDE + $x, $row * $STRIDE + $y)
      if ($keyGrass -and $p.A -gt 0 -and $GRASS_TONES -contains "$($p.R),$($p.G),$($p.B)") {
        $out.SetPixel($x, $y, $clear)
      }
      else {
        $out.SetPixel($x, $y, $p)
        if ($p.A -gt 0) { $kept++ }
      }
    }
  }
  return @{ bmp = $out; kept = $kept }
}

for ($i = 0; $i -lt $cells.Count; $i++) {
  $entry = $cells[$i]
  if ($entry.ContainsKey("bitmap")) {
    $b = $entry.bitmap
    $dx = $i * $CELL_SIZE + [int](($CELL_SIZE - $b.Width) / 2)
    $dy = $CELL_SIZE - $b.Height
    $g.DrawImage($b, (New-Object System.Drawing.Rectangle($dx, $dy, $b.Width, $b.Height)))
    "{0,2}  {1,-14} {2}x{3} (generated)" -f $i, $entry.name, $b.Width, $b.Height
    continue
  }
  $originX = $i * $CELL_SIZE + [int](($CELL_SIZE - $entry.w) / 2)
  $originY = $CELL_SIZE - $entry.h
  $keyGrass = $entry.ContainsKey("key")
  $note = ""
  foreach ($p in $entry.pieces) {
    $t = Get-Tile $tiles $p.c $p.r $keyGrass
    $dr = New-Object System.Drawing.Rectangle(($originX + $p.dx), ($originY + $p.dy), 16, 16)
    $g.DrawImage($t.bmp, $dr)
    if ($keyGrass) { $note = "-> $($t.kept)/256 px kept" }
    $t.bmp.Dispose()
  }
  "{0,2}  {1,-14} {2}x{3} {4}" -f $i, $entry.name, $entry.w, $entry.h, $note
}

$g.Dispose()
$sheet.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
"saved $outPath ({0}x{1})" -f $sheetW, $CELL_SIZE

# ------------------------------------------------------------------ grass
# The field was one 16px tile repeated, which reads as flat and visibly
# gridded. This bakes a 16x16-tile mosaic instead: four grass variants, each
# randomly flipped on either axis (so 16 distinct-looking cells from 4
# sources), plus a gentle wrapping brightness field so the ground has broad
# light and dark patches rather than one uniform green. Repeat period goes
# from 32px on screen to 512px, which is past the point the eye picks it out.
$GRASS_SRC = @(@(0, 15), @(1, 15), @(0, 16), @(1, 16))
$TILES_PER_SIDE = 16
$grassPx = $TILES_PER_SIDE * 16
$grassPath = Join-Path $assets "grass.png"

$rand = New-Object System.Random(20260814)
$grass = New-Object System.Drawing.Bitmap($grassPx, $grassPx, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gg = [System.Drawing.Graphics]::FromImage($grass)
$gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

for ($ty = 0; $ty -lt $TILES_PER_SIDE; $ty++) {
  for ($tx = 0; $tx -lt $TILES_PER_SIDE; $tx++) {
    $src = $GRASS_SRC[$rand.Next(0, $GRASS_SRC.Count)]
    $t = Get-Tile $tiles $src[0] $src[1] $false
    $b = $t.bmp
    if ($rand.Next(0, 2) -eq 1) { $b.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
    if ($rand.Next(0, 2) -eq 1) { $b.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipY) }
    $gg.DrawImage($b, (New-Object System.Drawing.Rectangle(($tx * 16), ($ty * 16), 16, 16)))
    $b.Dispose()
  }
}
$gg.Dispose()

# Wrapping value-noise brightness field. The lattice indices wrap modulo N,
# so the left edge interpolates back into the right edge and the texture
# still tiles seamlessly after shading.
$N = 4
$field = New-Object 'double[,]' $N, $N
for ($y = 0; $y -lt $N; $y++) { for ($x = 0; $x -lt $N; $x++) { $field[$x, $y] = $rand.NextDouble() } }
function Smooth([double]$t) { return $t * $t * (3.0 - 2.0 * $t) }

for ($y = 0; $y -lt $grassPx; $y++) {
  $fy = $y / $grassPx * $N
  $y0 = [Math]::Floor($fy); $ty2 = Smooth ($fy - $y0)
  for ($x = 0; $x -lt $grassPx; $x++) {
    $fx = $x / $grassPx * $N
    $x0 = [Math]::Floor($fx); $tx2 = Smooth ($fx - $x0)
    $a = $field[($x0 % $N), ($y0 % $N)]
    $b2 = $field[(($x0 + 1) % $N), ($y0 % $N)]
    $c2 = $field[($x0 % $N), (($y0 + 1) % $N)]
    $d = $field[(($x0 + 1) % $N), (($y0 + 1) % $N)]
    $n = ($a * (1 - $tx2) + $b2 * $tx2) * (1 - $ty2) + ($c2 * (1 - $tx2) + $d * $tx2) * $ty2
    $mul = 0.90 + 0.17 * $n
    $p = $grass.GetPixel($x, $y)
    $nr = [Math]::Min(255, [int]($p.R * $mul))
    $ng = [Math]::Min(255, [int]($p.G * $mul))
    $nb = [Math]::Min(255, [int]($p.B * $mul))
    $grass.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, $nr, $ng, $nb))
  }
}
$grass.Save($grassPath, [System.Drawing.Imaging.ImageFormat]::Png)
$grass.Dispose()
"saved $grassPath ({0}x{1}, {2} source variants)" -f $grassPx, $grassPx, $GRASS_SRC.Count

$tiles.Dispose()
$rockA.Dispose()
$rockB.Dispose()
