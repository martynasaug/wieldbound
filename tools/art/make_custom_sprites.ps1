# Generates the two creature sprites the 0x72 pack has no equivalent for
# (slime, wolf) as 4-frame animations, drawn to match its style: chunky
# silhouette, hard 1px outer outline, 3-4 tone shading, tiny bright eyes.
#
# Technique: fill a "material" grid from ellipse/rect primitives, derive the
# outline from the silhouette edge, then colorize per material. Far more
# reliable than hand-typing character maps, and symmetric by construction.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"

$outDir = Join-Path $scratch "custom"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# material ids
$M_EMPTY = 0
$M_BODY = 1
$M_LIGHT = 2
$M_DARK = 3
$M_EYE = 4
$M_PUPIL = 5
$M_SHINE = 6

function New-Grid([int]$w, [int]$h) {
  $g = New-Object 'int[,]' $w, $h
  # leading comma stops PowerShell unrolling the 2D array into int[] on return
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

function Fill-Tri([int[,]]$grid, [int]$w, [int]$h, [double]$ax, [double]$ay, [double]$bx, [double]$by, [double]$cx2, [double]$cy2, [int]$mat) {
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $px = $x + 0.5; $py = $y + 0.5
      $d1 = ($px - $bx) * ($ay - $by) - ($ax - $bx) * ($py - $by)
      $d2 = ($px - $cx2) * ($by - $cy2) - ($bx - $cx2) * ($py - $cy2)
      $d3 = ($px - $ax) * ($cy2 - $ay) - ($cx2 - $ax) * ($py - $ay)
      $hasNeg = ($d1 -lt 0) -or ($d2 -lt 0) -or ($d3 -lt 0)
      $hasPos = ($d1 -gt 0) -or ($d2 -gt 0) -or ($d3 -gt 0)
      if (-not ($hasNeg -and $hasPos)) { $grid[$x, $y] = $mat }
    }
  }
}

# Writes the grid out, adding a 1px outline in the empty cells that touch
# the silhouette (outside-outline, so it never eats into an already-small body).
function Save-Grid([int[,]]$grid, [int]$w, [int]$h, $palette, $outlineColor, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $transparent = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $m = $grid[$x, $y]
      if ($m -ne $M_EMPTY) {
        $bmp.SetPixel($x, $y, $palette[$m])
        continue
      }
      $touches = $false
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $nx = $x + $d[0]; $ny = $y + $d[1]
        if ($nx -ge 0 -and $nx -lt $w -and $ny -ge 0 -and $ny -lt $h) {
          if ($grid[$nx, $ny] -ne $M_EMPTY) { $touches = $true }
        }
      }
      if ($touches) { $bmp.SetPixel($x, $y, $outlineColor) } else { $bmp.SetPixel($x, $y, $transparent) }
    }
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function C($r, $g, $b) { return [System.Drawing.Color]::FromArgb(255, $r, $g, $b) }

# ---------------------------------------------------------------- slime
# Squash-and-stretch bob: the classic slime idle. Wider+shorter on the
# "landed" frames, taller+narrower mid-bounce.
$slimeOutline = C 26 20 40
$slimePal = @{}
$slimePal[$M_BODY] = C 75 189 91
$slimePal[$M_LIGHT] = C 121 224 138
$slimePal[$M_DARK] = C 47 122 63
$slimePal[$M_EYE] = C 255 255 255
$slimePal[$M_PUPIL] = C 26 20 40
$slimePal[$M_SHINE] = C 184 247 191

$sw = 18; $sh = 16
# per-frame: half-width, half-height
$slimeFrames = @(
  @{ rx = 6.4; ry = 4.6 },
  @{ rx = 5.9; ry = 5.4 },
  @{ rx = 6.4; ry = 4.6 },
  @{ rx = 6.9; ry = 4.0 }
)

for ($f = 0; $f -lt 4; $f++) {
  $spec = $slimeFrames[$f]
  $g = New-Grid $sw $sh
  $baseline = $sh - 2
  $cx = $sw / 2.0
  $cy = $baseline - $spec.ry
  Fill-Ellipse $g $sw $sh $cx $cy $spec.rx $spec.ry $M_BODY
  # flatten the bottom so it reads as sitting on the ground, not floating
  Fill-Rect $g $sw $sh 0 ([int]$baseline) ($sw - 1) ($sh - 1) $M_EMPTY
  for ($x = 0; $x -lt $sw; $x++) {
    if ($g[$x, ([int]$baseline - 1)] -ne $M_EMPTY) { $g[$x, [int]$baseline] = $M_DARK }
  }
  # tone bands: light cap, dark underside
  $topY = [int]($cy - $spec.ry)
  for ($y = 0; $y -lt $sh; $y++) {
    for ($x = 0; $x -lt $sw; $x++) {
      if ($g[$x, $y] -eq $M_BODY) {
        if ($y -le $topY + 1) { $g[$x, $y] = $M_LIGHT }
        elseif ($y -ge [int]($cy + $spec.ry * 0.55)) { $g[$x, $y] = $M_DARK }
      }
    }
  }
  # specular blob, upper-left
  Fill-Ellipse $g $sw $sh ($cx - $spec.rx * 0.42) ($cy - $spec.ry * 0.45) 1.6 1.1 $M_SHINE
  # eyes ride the body height so they stay put through the squash
  $eyeY = [int]($cy + 0.2)
  foreach ($ex in @([int]($cx - 2.6), [int]($cx + 1.6))) {
    Fill-Rect $g $sw $sh $ex $eyeY ($ex + 1) ($eyeY + 1) $M_EYE
    Fill-Rect $g $sw $sh ($ex + 1) ($eyeY + 1) ($ex + 1) ($eyeY + 1) $M_PUPIL
  }
  Save-Grid $g $sw $sh $slimePal $slimeOutline (Join-Path $outDir "slime_f$f.png")
}

# ---------------------------------------------------------------- wolf
# Side profile facing right (flipX handles the other way). Quadrupeds read
# far better in profile than front-on, and the pack's own creatures are
# front-facing, so this deliberately differs to make the wolf recognisable.
$wolfOutline = C 22 20 30
$wolfPal = @{}
$wolfPal[$M_BODY] = C 113 128 150
$wolfPal[$M_LIGHT] = C 160 174 192
$wolfPal[$M_DARK] = C 62 74 94
$wolfPal[$M_EYE] = C 246 173 85
$wolfPal[$M_PUPIL] = C 22 20 30
$wolfPal[$M_SHINE] = C 203 213 224

$ww = 26; $wh = 18
# Walk cycle: front/back leg pairs swing opposite, body bobs 1px.
$wolfFrames = @(
  @{ bob = 0; fl = 0; bl = 0 },
  @{ bob = -1; fl = 1; bl = -1 },
  @{ bob = 0; fl = 0; bl = 0 },
  @{ bob = -1; fl = -1; bl = 1 }
)

for ($f = 0; $f -lt 4; $f++) {
  $spec = $wolfFrames[$f]
  $g = New-Grid $ww $wh
  $ground = $wh - 2
  $bob = $spec.bob

  # legs first so the body overlaps their tops
  $legTop = $ground - 4 + $bob
  foreach ($pair in @(@{ x = 6; off = $spec.bl }, @{ x = 9; off = $spec.bl }, @{ x = 15; off = $spec.fl }, @{ x = 18; off = $spec.fl })) {
    $lx = $pair.x
    $len = 4 + $pair.off
    Fill-Rect $g $ww $wh $lx $legTop ($lx + 1) ($legTop + $len) $M_DARK
  }

  # torso
  Fill-Ellipse $g $ww $wh 12.0 (9.0 + $bob) 6.6 3.4 $M_BODY
  # chest / haunch mass
  Fill-Ellipse $g $ww $wh 16.5 (9.5 + $bob) 3.6 3.2 $M_BODY
  Fill-Ellipse $g $ww $wh 7.5 (9.0 + $bob) 3.4 3.4 $M_BODY

  # Tail: a distinct upswept wedge rather than a blob on the rump — without
  # this the silhouette reads as a lamb, not a canine.
  Fill-Tri $g $ww $wh 5.5 (9.5 + $bob) 5.5 (6.0 + $bob) 0.5 (2.5 + $bob) $M_BODY
  Fill-Ellipse $g $ww $wh 1.6 (3.4 + $bob) 1.7 1.6 $M_BODY

  # head + muzzle
  Fill-Ellipse $g $ww $wh 19.5 (6.5 + $bob) 3.2 2.9 $M_BODY
  Fill-Ellipse $g $ww $wh 22.5 (7.6 + $bob) 2.4 1.5 $M_BODY

  # ears: taller and sharper, the other half of "reads as canine"
  Fill-Tri $g $ww $wh 17.4 (5.0 + $bob) 19.0 (5.0 + $bob) 17.6 (0.8 + $bob) $M_BODY
  Fill-Tri $g $ww $wh 20.0 (4.8 + $bob) 21.8 (4.8 + $bob) 21.6 (1.0 + $bob) $M_BODY

  # top-lit: a narrow pale band along the spine only, so the body keeps a
  # dark wolfish mass instead of going uniformly pale
  for ($y = 0; $y -lt $wh; $y++) {
    for ($x = 0; $x -lt $ww; $x++) {
      if ($g[$x, $y] -eq $M_BODY) {
        if ($y -le 5 + $bob) { $g[$x, $y] = $M_LIGHT }
        elseif ($y -ge 10 + $bob) { $g[$x, $y] = $M_DARK }
      }
    }
  }
  # pale underbelly stripe
  Fill-Rect $g $ww $wh 9 (11 + $bob) 16 (11 + $bob) $M_SHINE

  # muzzle tip + eye
  Fill-Rect $g $ww $wh 24 (7 + $bob) 24 (8 + $bob) $M_PUPIL
  Fill-Rect $g $ww $wh 20 (6 + $bob) 21 (6 + $bob) $M_EYE
  Fill-Rect $g $ww $wh 21 (6 + $bob) 21 (6 + $bob) $M_PUPIL

  Save-Grid $g $ww $wh $wolfPal $wolfOutline (Join-Path $outDir "wolf_f$f.png")
}

"generated custom sprites in $outDir"

