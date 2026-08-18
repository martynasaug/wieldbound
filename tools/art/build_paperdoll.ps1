# Builds body.png and gear.png: a naked humanoid base plus equipment layers
# that stack on top of it.
#
# WHY THE BASE IS DRAWN RATHER THAN BORROWED
# Equipment overlays have to track the body's per-frame bob exactly or they
# visibly detach. The borrowed sprites bob irregularly (idle f3 sits 1px
# lower, run f0 1px higher), so authoring gear against them means matching
# those offsets by hand for every piece - fragile, and wrong the moment any
# frame changes. Generating the base from a parametric skeleton and drawing
# every gear layer from the SAME parameters makes alignment correct by
# construction: there is nothing to keep in sync because both come from one
# description of where the body is on that frame.
#
# Layers are separate sprites at runtime, which also means a tier tint can
# recolour armour without staining skin - the exact problem that made the
# old palette-swap approach unable to show gear independently of the body.

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
$ART_W = 16
$ART_H = 28
$FRAMES = 8   # idle f0-3, run f0-3

# ---------------------------------------------------------------- palette
function C([int]$r, [int]$g, [int]$b) { return [System.Drawing.Color]::FromArgb(255, $r, $g, $b) }
$SKIN = C 232 180 138
$SKIN_SH = C 190 140 104
$HAIR = C 92 62 40
$EYE = C 40 32 34
$CLOTH = C 150 128 110   # the scrap everyone starts in
$OUTLINE = C 28 24 28

# ------------------------------------------------------------- primitives
function NewArt { return New-Object System.Drawing.Bitmap($ART_W, $ART_H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb) }
function Px($bmp, [int]$x, [int]$y, $col) {
  if ($x -lt 0 -or $y -lt 0 -or $x -ge $script:ART_W -or $y -ge $script:ART_H) { return }
  $bmp.SetPixel($x, $y, $col)
}
function Rect($bmp, [int]$x0, [int]$y0, [int]$x1, [int]$y1, $col) {
  for ($y = $y0; $y -le $y1; $y++) { for ($x = $x0; $x -le $x1; $x++) { Px $bmp $x $y $col } }
}

# Adds a 1px dark edge around whatever the layer drew. Applied per layer, so
# each piece of gear reads as its own object when stacked over the body.
function Outline($bmp, $col) {
  $w = $bmp.Width; $h = $bmp.Height
  $solid = New-Object 'bool[,]' $w, $h
  for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) { $solid[$x, $y] = ($bmp.GetPixel($x, $y).A -gt 0) } }
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      if ($solid[$x, $y]) { continue }
      $touch = $false
      foreach ($d in @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))) {
        $nx = $x + $d[0]; $ny = $y + $d[1]
        if ($nx -ge 0 -and $nx -lt $w -and $ny -ge 0 -and $ny -lt $h -and $solid[$nx, $ny]) { $touch = $true }
      }
      if ($touch) { $bmp.SetPixel($x, $y, $col) }
    }
  }
}

# ---------------------------------------------------------------- skeleton
# One description of where the body is on a given frame. Every layer reads
# from this, which is the whole reason the layers stay in register.
function Skeleton([int]$frame) {
  $isRun = $frame -ge 4
  $i = $frame % 4
  if ($isRun) {
    $bob = @(0, -1, 0, -1)[$i]
    $legSwing = @(2, 0, -2, 0)[$i]
    $armSwing = @(-2, 0, 2, 0)[$i]
    $legLift = @(1, 0, 1, 0)[$i]
  }
  else {
    # Idle breathes: a single pixel, on one frame only.
    $bob = @(0, 0, 1, 0)[$i]
    $legSwing = 0
    $armSwing = 0
    $legLift = 0
  }
  return @{
    bob = $bob; legSwing = $legSwing; armSwing = $armSwing; legLift = $legLift
    # Slightly chibi proportions: a big head reads far better than a
    # realistic one at 16px, and it leaves the torso narrow enough that the
    # arms stay visible as separate limbs once armour goes over it.
    headTop = 2 + $bob; headBot = 8 + $bob
    neckY = 9 + $bob
    torsoTop = 10 + $bob; torsoBot = 18 + $bob
    armTop = 11 + $bob; armBot = 17 + $bob
    hipY = 19 + $bob
    legTop = 21 + $bob; footY = 27
    cx = 8
  }
}

# ------------------------------------------------------------------- body
function DrawBody($bmp, $s) {
  # legs (back leg first so the front one overlaps)
  $lx = 5 - [int]($s.legSwing / 2)
  $rx = 9 + [int]($s.legSwing / 2)
  Rect $bmp $lx $s.legTop ($lx + 1) ($s.footY - $s.legLift) $SKIN_SH
  Rect $bmp $rx $s.legTop ($rx + 1) $s.footY $SKIN
  # hips, and a loincloth so "unequipped" is bare but not indecent
  Rect $bmp 5 $s.hipY 10 ($s.hipY + 1) $CLOTH
  # torso, tapering to the waist so the silhouette is not a plain box
  Rect $bmp 5 $s.torsoTop 10 $s.torsoBot $SKIN
  Rect $bmp 5 $s.torsoTop 5 $s.torsoBot $SKIN_SH
  Px $bmp 5 $s.torsoBot ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  Px $bmp 10 $s.torsoBot ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  # pectoral shading, a hint of anatomy on the bare chest
  Px $bmp 7 ($s.torsoTop + 2) $SKIN_SH
  Px $bmp 8 ($s.torsoTop + 2) $SKIN_SH
  # arms hang clear of the 6-wide torso, swinging opposite the legs
  $alY = $s.armTop + [int]($s.armSwing / 2)
  $arY = $s.armTop - [int]($s.armSwing / 2)
  $armLen = $s.armBot - $s.armTop
  Rect $bmp 3 $alY 4 ($alY + $armLen) $SKIN_SH
  Rect $bmp 11 $arY 12 ($arY + $armLen) $SKIN
  # neck
  Rect $bmp 7 $s.neckY 8 $s.neckY $SKIN_SH
  # head
  Rect $bmp 4 $s.headTop 11 $s.headBot $SKIN
  Rect $bmp 4 $s.headTop 4 $s.headBot $SKIN_SH
  # rounded skull: knock the top corners off
  Px $bmp 4 $s.headTop ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  Px $bmp 11 $s.headTop ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  # hair sweeps back over the crown and down past the ears
  Rect $bmp 5 $s.headTop 10 ($s.headTop + 1) $HAIR
  Rect $bmp 4 ($s.headTop + 1) 4 ($s.headTop + 3) $HAIR
  Rect $bmp 11 ($s.headTop + 1) 11 ($s.headTop + 3) $HAIR
  # eyes and mouth
  Px $bmp 6 ($s.headTop + 3) $EYE
  Px $bmp 9 ($s.headTop + 3) $EYE
  Px $bmp 7 ($s.headTop + 5) $SKIN_SH
  Px $bmp 8 ($s.headTop + 5) $SKIN_SH
}

# ------------------------------------------------------------------- gear
# Each takes the same skeleton, so it lands on the body wherever the body is.
function DrawChest($bmp, $s, [string]$style) {
  # Shared rule: armour covers the 6-wide torso and only the TOP of the arms.
  # Leaving the forearms bare is what keeps the limbs readable as limbs -
  # covering the full arm column fuses body and armour into one blob.
  $shTop = $s.torsoTop
  $shBot = $s.torsoTop + 2
  switch ($style) {
    "leather" {
      $main = C 146 96 54; $dark = C 96 60 34; $trim = C 196 150 88
      Rect $bmp 5 $s.torsoTop 10 $s.torsoBot $main
      Rect $bmp 5 $s.torsoTop 5 $s.torsoBot $dark
      Rect $bmp 5 $s.torsoBot 10 $s.torsoBot $trim
      # cross-strap over the chest
      Px $bmp 6 ($s.torsoTop + 2) $trim
      Px $bmp 7 ($s.torsoTop + 3) $trim
      Px $bmp 8 ($s.torsoTop + 4) $trim
      Px $bmp 9 ($s.torsoTop + 5) $trim
      Rect $bmp 4 $shTop 4 $shBot $dark
      Rect $bmp 11 $shTop 11 $shBot $main
    }
    "chain" {
      $main = C 168 176 190; $dark = C 104 112 128
      Rect $bmp 5 $s.torsoTop 10 $s.torsoBot $main
      Rect $bmp 5 $s.torsoTop 5 $s.torsoBot $dark
      # ring texture: alternating darker pixels
      for ($y = $s.torsoTop; $y -le $s.torsoBot; $y++) {
        for ($x = 6; $x -le 10; $x++) { if ((($x + $y) % 2) -eq 0) { Px $bmp $x $y $dark } }
      }
      Rect $bmp 3 $shTop 4 $shBot $dark
      Rect $bmp 11 $shTop 12 $shBot $main
    }
    "plate" {
      $main = C 206 214 228; $dark = C 118 130 152; $gold = C 226 186 96
      Rect $bmp 5 $s.torsoTop 10 $s.torsoBot $main
      Rect $bmp 5 $s.torsoTop 5 $s.torsoBot $dark
      # gorget and belt in gold, breastplate ridge down the centre
      Rect $bmp 5 $s.torsoTop 10 $s.torsoTop $gold
      Rect $bmp 5 $s.torsoBot 10 $s.torsoBot $gold
      Rect $bmp 7 ($s.torsoTop + 1) 7 ($s.torsoBot - 1) $dark
      # pauldrons flare a pixel wider than the chain ones
      Rect $bmp 3 $shTop 4 ($shBot + 1) $dark
      Rect $bmp 11 $shTop 12 ($shBot + 1) $main
      Px $bmp 3 $shTop $gold
      Px $bmp 12 $shTop $gold
    }
    "robe" {
      $main = C 92 84 176; $dark = C 58 52 124; $trim = C 214 196 120
      Rect $bmp 5 $s.torsoTop 10 $s.torsoBot $main
      Rect $bmp 5 $s.torsoTop 5 $s.torsoBot $dark
      # skirt flares past the hips down to the knee
      Rect $bmp 4 ($s.hipY) 11 ($s.legTop + 3) $main
      Rect $bmp 4 ($s.hipY) 5 ($s.legTop + 3) $dark
      Rect $bmp 4 ($s.legTop + 3) 11 ($s.legTop + 3) $trim
      # gold placket down the front
      Rect $bmp 8 $s.torsoTop 8 ($s.legTop + 2) $trim
      # loose sleeves cover more of the arm than plate does
      Rect $bmp 3 $shTop 4 ($shBot + 2) $dark
      Rect $bmp 11 $shTop 12 ($shBot + 2) $main
    }
  }
}

function DrawHelm($bmp, $s, [string]$style) {
  # The head spans x4..11, headTop..headBot, with the top corners rounded off
  # by the body layer - helms round the same corners so they sit flush.
  $clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  switch ($style) {
    "cap" {
      # A skullcap: crown only, hair and face still visible.
      $main = C 150 100 58; $dark = C 98 62 34
      Rect $bmp 4 $s.headTop 11 ($s.headTop + 2) $main
      Rect $bmp 4 ($s.headTop + 2) 11 ($s.headTop + 2) $dark
      Px $bmp 4 $s.headTop $clear
      Px $bmp 11 $s.headTop $clear
    }
    "hood" {
      # Cowl framing the face - the opening is what makes it read as a hood.
      $main = C 74 92 70; $dark = C 46 60 46
      Rect $bmp 4 $s.headTop 11 ($s.headTop + 2) $main
      Rect $bmp 4 ($s.headTop + 1) 4 ($s.headBot + 1) $dark
      Rect $bmp 11 ($s.headTop + 1) 11 ($s.headBot + 1) $main
      Rect $bmp 5 ($s.headTop + 1) 5 ($s.headTop + 2) $dark
      Rect $bmp 10 ($s.headTop + 1) 10 ($s.headTop + 2) $main
      Rect $bmp 4 ($s.headBot + 1) 11 ($s.headBot + 1) $dark
      Px $bmp 4 $s.headTop $clear
      Px $bmp 11 $s.headTop $clear
    }
    "full" {
      # Closed great helm: face fully hidden behind a visor slit.
      $main = C 200 208 222; $dark = C 112 124 146; $gold = C 226 186 96
      Rect $bmp 4 $s.headTop 11 $s.headBot $main
      Rect $bmp 4 $s.headTop 4 $s.headBot $dark
      Px $bmp 4 $s.headTop $clear
      Px $bmp 11 $s.headTop $clear
      # visor slit and nasal bar
      Rect $bmp 5 ($s.headTop + 3) 10 ($s.headTop + 4) $dark
      Rect $bmp 7 ($s.headTop + 3) 8 ($s.headTop + 4) $main
      # crest above the crown
      Rect $bmp 7 ($s.headTop - 2) 8 ($s.headTop - 1) $gold
    }
  }
}

function DrawBoots($bmp, $s, [string]$style) {
  $lx = 5 - [int]($s.legSwing / 2)
  $rx = 9 + [int]($s.legSwing / 2)
  switch ($style) {
    "low" {
      $main = C 92 62 40; $dark = C 60 40 26
      Rect $bmp $lx ($s.footY - 2 - $s.legLift) ($lx + 1) ($s.footY - $s.legLift) $dark
      Rect $bmp $rx ($s.footY - 2) ($rx + 1) $s.footY $main
    }
    "tall" {
      $main = C 118 76 44; $dark = C 74 48 28; $trim = C 196 158 92
      Rect $bmp $lx ($s.footY - 5 - $s.legLift) ($lx + 1) ($s.footY - $s.legLift) $dark
      Rect $bmp $rx ($s.footY - 5) ($rx + 1) $s.footY $main
      Px $bmp $lx ($s.footY - 5 - $s.legLift) $trim
      Px $bmp $rx ($s.footY - 5) $trim
    }
  }
}

function DrawCape($bmp, $s) {
  $main = C 152 42 52; $dark = C 104 26 36
  # trails behind, swaying with the run
  # Drawn behind the body, so it only shows where it spills past the torso.
  # It sways with the arm swing, which is the same signal the run cycle uses.
  $sway = [int]($s.armSwing / 2)
  $hem = $s.legTop + 3
  Rect $bmp (3 + $sway) $s.torsoTop (12 + $sway) ($s.torsoTop + 1) $main
  Rect $bmp (3 + $sway) ($s.torsoTop + 2) (12 + $sway) $hem $main
  Rect $bmp (3 + $sway) ($s.torsoTop + 2) (4 + $sway) $hem $dark
  Rect $bmp (3 + $sway) $hem (12 + $sway) $hem $dark
  # ragged hem so it does not end on a flat line
  Px $bmp (5 + $sway) $hem ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  Px $bmp (10 + $sway) $hem ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
}

# ------------------------------------------------------------------ build
function RenderSheet([string]$file, $rows) {
  $sheet = New-Object System.Drawing.Bitmap(($FRAMES * $CELL_W), ($rows.Count * $CELL_H), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($sheet)
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

  for ($r = 0; $r -lt $rows.Count; $r++) {
    $row = $rows[$r]
    for ($f = 0; $f -lt $FRAMES; $f++) {
      $s = Skeleton $f
      $art = NewArt
      switch ($row.kind) {
        "body" { DrawBody $art $s }
        "chest" { DrawChest $art $s $row.style }
        "helm" { DrawHelm $art $s $row.style }
        "boots" { DrawBoots $art $s $row.style }
        "cape" { DrawCape $art $s }
      }
      Outline $art $OUTLINE
      $dx = $f * $CELL_W + [int](($CELL_W - $ART_W) / 2)
      $dy = $r * $CELL_H + ($CELL_H - $ART_H)
      $g.DrawImage($art, (New-Object System.Drawing.Rectangle($dx, $dy, $ART_W, $ART_H)))
      $art.Dispose()
    }
    "  row {0,2}  {1}" -f $r, $row.name
  }
  $g.Dispose()
  $sheet.Save((Join-Path $assets $file), [System.Drawing.Imaging.ImageFormat]::Png)
  "saved {0} ({1}x{2})" -f $file, ($FRAMES * $CELL_W), ($rows.Count * $CELL_H)
  $sheet.Dispose()
}

"--- body.png ---"
RenderSheet "body.png" @(@{ name = "naked"; kind = "body" })
""
"--- gear.png ---"
RenderSheet "gear.png" @(
  @{ name = "chest_leather"; kind = "chest"; style = "leather" },
  @{ name = "chest_chain"; kind = "chest"; style = "chain" },
  @{ name = "chest_plate"; kind = "chest"; style = "plate" },
  @{ name = "chest_robe"; kind = "chest"; style = "robe" },
  @{ name = "helm_cap"; kind = "helm"; style = "cap" },
  @{ name = "helm_hood"; kind = "helm"; style = "hood" },
  @{ name = "helm_full"; kind = "helm"; style = "full" },
  @{ name = "boots_low"; kind = "boots"; style = "low" },
  @{ name = "boots_tall"; kind = "boots"; style = "tall" },
  @{ name = "cape"; kind = "cape" }
)
