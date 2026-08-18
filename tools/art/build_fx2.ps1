# Builds client/public/assets/fx.png - the effect library, rebuilt at
# higher fidelity for the class/skill system.
#
# Changes from the first version: cells go 32 -> 48px, frames 4 -> 6, and
# the drawing primitives gained soft alpha falloff instead of hard-edged
# fills. The old effects read as flat shapes because every pixel in a disc
# had identical alpha; ramping alpha by radius is what makes a glow look
# like light rather than a sticker. 14 effects, one per damage school the
# three classes need plus the support shapes.
#
# Index = effectRow * FRAMES + frame.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"

$CELL = 48
$FRAMES = 6
$effects = @(
  "slash", "impact", "arcane", "heal", "fire", "frost", "lightning",
  "buff", "arrow", "poison", "shadow", "holy", "shield", "quake"
)

$W = $FRAMES * $CELL
$H = $effects.Count * $CELL
$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$rand = New-Object System.Random(1337)
$C = 24.0   # cell centre

# Accumulating plot: brighter where strokes overlap, which is what gives
# these a sense of glow rather than flat paint.
function Plot([int]$row, [int]$frame, [double]$fx, [double]$fy, [int]$a, [int]$r, [int]$g, [int]$b) {
  $x = [int][Math]::Floor($fx); $y = [int][Math]::Floor($fy)
  if ($x -lt 0 -or $y -lt 0 -or $x -ge $script:CELL -or $y -ge $script:CELL) { return }
  if ($a -le 0) { return }
  $px = $frame * $script:CELL + $x
  $py = $row * $script:CELL + $y
  $old = $script:bmp.GetPixel($px, $py)
  $na = [Math]::Min(255, $old.A + $a)
  # weight the incoming colour by how much alpha it brings
  $t = $a / [double][Math]::Max(1, $old.A + $a)
  $nr = [int]($old.R * (1 - $t) + $r * $t)
  $ng = [int]($old.G * (1 - $t) + $g * $t)
  $nb = [int]($old.B * (1 - $t) + $b * $t)
  $script:bmp.SetPixel($px, $py, [System.Drawing.Color]::FromArgb($na, $nr, $ng, $nb))
}

# Soft disc: alpha ramps to zero at the rim, so it reads as light.
function Glow([int]$row, [int]$frame, [double]$cx, [double]$cy, [double]$rad, [int]$a, [int]$r, [int]$g, [int]$b, [double]$core = 0.35) {
  $ri = [int][Math]::Ceiling($rad)
  for ($y = -$ri; $y -le $ri; $y++) {
    for ($x = -$ri; $x -le $ri; $x++) {
      $d = [Math]::Sqrt($x * $x + $y * $y)
      if ($d -gt $rad) { continue }
      $t = $d / [Math]::Max(0.001, $rad)
      $falloff = if ($t -lt $core) { 1.0 } else { 1.0 - (($t - $core) / (1.0 - $core)) }
      Plot $row $frame ($cx + $x) ($cy + $y) ([int]($a * $falloff * $falloff)) $r $g $b
    }
  }
}

function Ring([int]$row, [int]$frame, [double]$cx, [double]$cy, [double]$rad, [double]$thick, [int]$a, [int]$r, [int]$g, [int]$b, [double]$a0 = -180, [double]$a1 = 180) {
  $steps = [Math]::Max(24, [int]($rad * 9))
  for ($i = 0; $i -le $steps; $i++) {
    $ang = $a0 + ($a1 - $a0) * ($i / [double]$steps)
    $rad2 = $ang * [Math]::PI / 180.0
    for ($t = -$thick; $t -le $thick; $t += 0.5) {
      $rr = $rad + $t
      $fade = 1.0 - [Math]::Abs($t) / [Math]::Max(0.001, $thick)
      Plot $row $frame ($cx + [Math]::Cos($rad2) * $rr) ($cy + [Math]::Sin($rad2) * $rr) ([int]($a * $fade)) $r $g $b
    }
  }
}

function Streak([int]$row, [int]$frame, [double]$x0, [double]$y0, [double]$x1, [double]$y1, [double]$thick, [int]$a, [int]$r, [int]$g, [int]$b) {
  $len = [Math]::Sqrt(($x1 - $x0) * ($x1 - $x0) + ($y1 - $y0) * ($y1 - $y0))
  $steps = [Math]::Max(6, [int]($len * 2))
  for ($i = 0; $i -le $steps; $i++) {
    $t = $i / [double]$steps
    $px = $x0 + ($x1 - $x0) * $t
    $py = $y0 + ($y1 - $y0) * $t
    Glow $row $frame $px $py $thick ([int]($a * (1 - $t * 0.35))) $r $g $b 0.2
  }
}

for ($f = 0; $f -lt $FRAMES; $f++) {
  $t = $f / [double]($FRAMES - 1)     # 0..1 life
  $fade = [int](255 - 175 * $t)
  $grow = 1.0 - [Math]::Pow(1.0 - $t, 2)   # ease-out for expanding shapes

  # 0 slash - crescent with a bright leading edge that thins as it sweeps
  $sr = 7 + 13 * $grow
  Ring 0 $f $C $C $sr (3.4 - 1.8 * $t) $fade 255 255 255 (-75 - 35 * $t) (30 + 50 * $t)
  Ring 0 $f $C $C ($sr + 1.5) (1.2) ([int]($fade * 0.55)) 150 205 255 (-70 - 35 * $t) (25 + 50 * $t)

  # 1 impact - starburst plus an expanding shockwave
  for ($s = 0; $s -lt 10; $s++) {
    $ang = $s * 36 + 9
    $rad = $ang * [Math]::PI / 180
    $r0 = 3 + 12 * $grow
    $r1 = 7 + 19 * $grow
    Streak 1 $f ($C + [Math]::Cos($rad) * $r0) ($C + [Math]::Sin($rad) * $r0) ($C + [Math]::Cos($rad) * $r1) ($C + [Math]::Sin($rad) * $r1) 1.3 $fade 255 238 190
  }
  Ring 1 $f $C $C (6 + 16 * $grow) 1.6 ([int]($fade * 0.5)) 255 220 160
  if ($t -lt 0.45) { Glow 1 $f $C $C (7 - 8 * $t) 255 255 255 255 }

  # 2 arcane - orb with orbiting sparks (mage's basic bolt)
  Glow 2 $f $C $C (6 + 5 * $t) $fade 176 132 255 0.15
  Glow 2 $f $C $C (3 - 1.2 * $t) 255 255 255 255
  for ($s = 0; $s -lt 5; $s++) {
    $ang = $s * 72 + $t * 260
    $rad = $ang * [Math]::PI / 180
    $orb = 8 + 9 * $t
    Glow 2 $f ($C + [Math]::Cos($rad) * $orb) ($C + [Math]::Sin($rad) * $orb) 2.2 ([int]($fade * 0.9)) 214 180 255 0.2
  }

  # 3 heal - motes drifting up out of a soft ground glow
  Glow 3 $f $C ($C + 12 - 6 * $t) (13 - 4 * $t) ([int]($fade * 0.35)) 150 255 170 0.05
  foreach ($s in @(@(-11, 6), @(-4, 11), @(3, 8), @(10, 12), @(-8, 14), @(7, 15))) {
    $sy = $C + $s[1] - 30 * $grow
    $sx = $C + $s[0] + [Math]::Sin($t * 6 + $s[0]) * 2
    Glow 3 $f $sx $sy (3.2 - 1.2 * $t) $fade 190 255 190 0.15
    Glow 3 $f $sx $sy 1.1 $fade 255 255 255
  }

  # 4 fire - stacked flame bodies rising and shrinking, with embers
  $fy = $C + 8 - 20 * $grow
  Glow 4 $f $C $fy (13 - 5 * $t) ([int]($fade * 0.85)) 226 74 30 0.1
  Glow 4 $f $C ($fy + 1) (8.5 - 3.5 * $t) $fade 246 152 40 0.2
  Glow 4 $f $C ($fy + 2) (4.5 - 2 * $t) $fade 255 236 160 0.3
  for ($s = 0; $s -lt 6; $s++) {
    $ex = $C + ($rand.NextDouble() - 0.5) * 26
    $ey = $C + 10 - 34 * $t * $rand.NextDouble()
    Glow 4 $f $ex $ey 1.4 ([int]($fade * 0.8)) 255 190 90 0.2
  }

  # 5 frost - shards radiating out of a bright core, plus a mist ring
  for ($s = 0; $s -lt 8; $s++) {
    $ang = $s * 45 + 12
    $rad = $ang * [Math]::PI / 180
    $r0 = 2 + 8 * $grow
    $r1 = 8 + 16 * $grow
    Streak 5 $f ($C + [Math]::Cos($rad) * $r0) ($C + [Math]::Sin($rad) * $r0) ($C + [Math]::Cos($rad) * $r1) ($C + [Math]::Sin($rad) * $r1) 1.7 $fade 176 232 255
  }
  Ring 5 $f $C $C (9 + 12 * $grow) 1.3 ([int]($fade * 0.4)) 120 200 245
  Glow 5 $f $C $C (5 - 3 * $t) $fade 240 252 255 0.3

  # 6 lightning - branching bolt with a flash that dies fast
  $lx = $C
  for ($y = 0; $y -lt $CELL; $y += 2) {
    $nx = $lx + ($rand.NextDouble() - 0.5) * 7
    if ($nx -lt 8) { $nx = 8 }; if ($nx -gt 40) { $nx = 40 }
    Streak 6 $f $lx $y $nx ($y + 2) (2.2 - 1.0 * $t) $fade 226 216 255
    Streak 6 $f $lx $y $nx ($y + 2) (0.9) $fade 255 255 255
    if ($y -eq 22) {
      Streak 6 $f $nx $y ($nx + 12) ($y + 11) 1.3 ([int]($fade * 0.7)) 200 190 255
    }
    $lx = $nx
  }
  if ($t -lt 0.35) { Glow 6 $f $C $C 20 ([int](110 * (1 - $t / 0.35))) 220 210 255 0.0 }

  # 7 buff - expanding ring with motes lifting off it
  $br = 6 + 15 * $grow
  Ring 7 $f $C $C $br (2.6 - 1.2 * $t) $fade 255 226 140
  Ring 7 $f $C $C ($br - 2) (1.0) ([int]($fade * 0.5)) 255 250 210
  for ($s = 0; $s -lt 6; $s++) {
    $ang = $s * 60 + 20
    $rad = $ang * [Math]::PI / 180
    Glow 7 $f ($C + [Math]::Cos($rad) * $br) ($C + [Math]::Sin($rad) * $br - 8 * $t) 2.0 $fade 255 240 180 0.2
  }

  # 8 arrow - a piercing streak that splinters on landing (ranger)
  $ax = 4 + 40 * $grow
  Streak 8 $f ($ax - 16) $C $ax $C (2.2 - 0.8 * $t) $fade 255 246 214
  Glow 8 $f $ax $C (3.2 - 1.2 * $t) $fade 255 255 255 0.3
  if ($t -gt 0.5) {
    for ($s = 0; $s -lt 5; $s++) {
      $ang = -60 + $s * 30
      $rad = $ang * [Math]::PI / 180
      $sp = ($t - 0.5) * 26
      Streak 8 $f $ax $C ($ax + [Math]::Cos($rad) * $sp) ($C + [Math]::Sin($rad) * $sp) 1.0 ([int]($fade * 0.8)) 255 226 170
    }
  }

  # 9 poison - bubbling cloud that swells and sags
  for ($s = 0; $s -lt 7; $s++) {
    $ang = $s * 51 + $t * 60
    $rad = $ang * [Math]::PI / 180
    $orb = 4 + 12 * $grow
    $bx = $C + [Math]::Cos($rad) * $orb
    $by = $C + [Math]::Sin($rad) * $orb * 0.7 + 4 * $t
    Glow 9 $f $bx $by (5.5 - 1.6 * $t) ([int]($fade * 0.75)) 116 196 74 0.15
    Glow 9 $f $bx $by 2.0 ([int]($fade * 0.9)) 190 244 140 0.25
  }

  # 10 shadow - dark swirl edged in violet
  for ($s = 0; $s -lt 5; $s++) {
    $base = $s * 72 + $t * 300
    for ($k = 0; $k -lt 12; $k++) {
      $ang = ($base + $k * 9) * [Math]::PI / 180
      $rr = 3 + $k * 1.5 + 8 * $grow
      Plot 10 $f ($C + [Math]::Cos($ang) * $rr) ($C + [Math]::Sin($ang) * $rr) ([int]($fade * 0.8)) 60 26 86
      Plot 10 $f ($C + [Math]::Cos($ang) * ($rr + 1)) ($C + [Math]::Sin($ang) * ($rr + 1)) ([int]($fade * 0.5)) 168 92 224
    }
  }
  Glow 10 $f $C $C (9 - 4 * $t) ([int]($fade * 0.7)) 32 14 46 0.1

  # 11 holy - pillar of light with rays
  Streak 11 $f $C 2 $C 46 (7 - 3 * $t) ([int]($fade * 0.55)) 255 246 200
  Streak 11 $f $C 2 $C 46 (2.6 - 1 * $t) $fade 255 255 255
  for ($s = 0; $s -lt 8; $s++) {
    $ang = $s * 45 + 22
    $rad = $ang * [Math]::PI / 180
    $rr = 6 + 16 * $grow
    Streak 11 $f $C $C ($C + [Math]::Cos($rad) * $rr) ($C + [Math]::Sin($rad) * $rr) 1.0 ([int]($fade * 0.6)) 255 240 190
  }

  # 12 shield - hexagonal barrier that flares then settles
  $hr = 15 + 4 * $grow
  for ($s = 0; $s -lt 6; $s++) {
    $a1 = ($s * 60) * [Math]::PI / 180
    $a2 = (($s + 1) * 60) * [Math]::PI / 180
    Streak 12 $f ($C + [Math]::Cos($a1) * $hr) ($C + [Math]::Sin($a1) * $hr) ($C + [Math]::Cos($a2) * $hr) ($C + [Math]::Sin($a2) * $hr) (1.8 - 0.7 * $t) $fade 150 216 255
  }
  Glow 12 $f $C $C ($hr * 0.9) ([int]($fade * 0.22)) 120 190 255 0.0

  # 13 quake - ground cracks with a dust ring (warrior slam)
  Ring 13 $f $C $C (5 + 18 * $grow) (2.2 - 0.9 * $t) ([int]($fade * 0.8)) 186 150 106
  for ($s = 0; $s -lt 7; $s++) {
    $ang = $s * 51 + 14
    $rad = $ang * [Math]::PI / 180
    $r1 = 4 + 20 * $grow
    Streak 13 $f $C $C ($C + [Math]::Cos($rad) * $r1) ($C + [Math]::Sin($rad) * $r1 * 0.6) 1.4 $fade 122 92 62
  }
  Glow 13 $f $C $C (6 - 5 * $t) ([int]($fade * 0.6)) 226 196 150 0.2
}

$bmp.Save((Join-Path $assets "fx.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved fx.png ({0}x{1}) - {2} effects x {3} frames, cell {4}" -f $W, $H, $effects.Count, $FRAMES, $CELL
for ($i = 0; $i -lt $effects.Count; $i++) { "  row {0,2} = {1}" -f $i, $effects[$i] }
