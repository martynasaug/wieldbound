# Composites the paperdoll exactly the way WorldScene does - body, then one
# gear layer per visible slot at the same frame, then the weapon parked at
# the grip - so alignment bugs show up here rather than in the browser.

Add-Type -AssemblyName System.Drawing

# Paths resolve from this script's own location, so the repo works wherever
# it is cloned. Previously these were absolute paths into one machine's home
# directory, which is why this tooling could not leave that machine.
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$assets = Join-Path $root "client\public\assets"
$dl = Join-Path $PSScriptRoot "src\0x72"
$custom = Join-Path $PSScriptRoot "src\custom"
$out = Join-Path $PSScriptRoot "preview.png"

$body = [System.Drawing.Bitmap]::FromFile((Join-Path $assets "body.png"))
$gear = [System.Drawing.Bitmap]::FromFile((Join-Path $assets "gear.png"))
$wpn = [System.Drawing.Bitmap]::FromFile((Join-Path $assets "weapons.png"))

$CW = 32; $CH = 36
# GEAR_STYLES order = gear.png row order.
$STYLES = @("leather", "chain", "plate", "robe", "cap", "hood", "full", "low", "tall", "cape")
function Row($s) { return [array]::IndexOf($STYLES, $s) }

# Must match WEAPON_GRIP_FROM_BOTTOM and PLAYER_GRIP in WorldScene.
$GRIP_X = 4; $GRIP_Y = -11
$WCELL_W = 16; $WCELL_H = 40
$FAMILIES = @("sword", "axe", "mace", "dagger", "bow", "staff", "wand")
$GRIP_FROM_BOTTOM = @{ sword = 3; axe = 4; mace = 4; dagger = 2; bow = 13; staff = 8; wand = 3 }

# Each preview column: which layers are worn, and which weapon is held.
$cases = @(
  @{ name = "naked"; layers = @(); wpn = $null },
  @{ name = "leather+cap+low"; layers = @("cape", "leather", "cap", "low"); wpn = "sword" },
  @{ name = "plate+full+tall"; layers = @("cape", "plate", "full", "tall"); wpn = "axe" },
  @{ name = "robe+hood"; layers = @("robe", "hood"); wpn = "staff" },
  @{ name = "chain+cap"; layers = @("chain", "cap", "low"); wpn = "bow" },
  @{ name = "robe+hood/wand"; layers = @("robe", "hood"); wpn = "wand" },
  @{ name = "leather/dagger"; layers = @("leather", "low"); wpn = "dagger" },
  @{ name = "plate/mace"; layers = @("plate", "full"); wpn = "mace" }
)

$FRAMES = @(0, 2, 4, 6)   # two idle, two run
$S = 9                     # zoom
$padX = 4
$cellW = ($CW + $padX) * $FRAMES.Count
$sheet = New-Object System.Drawing.Bitmap(($cellW * $S), ($cases.Count * ($CH + 8) * $S))
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::FromArgb(255, 60, 78, 52))

function Blit($srcBmp, [int]$col, [int]$row, [int]$dx, [int]$dy) {
  $srcRect = New-Object System.Drawing.Rectangle(($col * $CW), ($row * $CH), $CW, $CH)
  $dstRect = New-Object System.Drawing.Rectangle(($dx * $S), ($dy * $S), ($CW * $S), ($CH * $S))
  $g.DrawImage($srcBmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
}

$ci = 0
foreach ($case in $cases) {
  $fi = 0
  foreach ($f in $FRAMES) {
    $dx = $fi * ($CW + $padX)
    $dy = 4 + $ci * ($CH + 8)
    Blit $body $f 0 $dx $dy
    foreach ($style in $case.layers) { Blit $gear $f (Row $style) $dx $dy }
    if ($case.wpn) {
      # Feet sit at the cell bottom; the hand is GRIP_Y above that, and the
      # weapon's own grip pixel is placed exactly there.
      $feetY = $dy + $CH
      $handX = $dx + [int]($CW / 2) + $GRIP_X
      $handY = $feetY + $GRIP_Y
      $tier = 0
      $idx = ([array]::IndexOf($FAMILIES, $case.wpn)) * 3 + $tier
      $srcRect = New-Object System.Drawing.Rectangle(($idx * $WCELL_W), 0, $WCELL_W, $WCELL_H)
      $wx = $handX - [int]($WCELL_W / 2)
      $wy = $handY - ($WCELL_H - $GRIP_FROM_BOTTOM[$case.wpn])
      $dstRect = New-Object System.Drawing.Rectangle(($wx * $S), ($wy * $S), ($WCELL_W * $S), ($WCELL_H * $S))
      $g.DrawImage($wpn, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    }
    $fi++
  }
  $ci++
}
$g.Dispose()
$sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose(); $body.Dispose(); $gear.Dispose(); $wpn.Dispose()
"saved $out"
($cases | ForEach-Object { $_.name }) -join " | "
