# Downscales four hand-picked frames from Kenney's CC0 "Particle Pack" into
# the runtime VFX textures projectile flight and skill-shape rings use.
#
# Every projectile in the game — an arrow, a bolt, a beam — was pure
# procedural geometry with a flat additive colour: a sphere, a cone, a
# cylinder. That solved a real visibility problem (M64.1: a camera-facing
# atlas quad read as "a soft smudge" at this distance) but traded it for a
# different one — a lit sphere is a faceted ball of colour, not a glow, and
# nothing about the shape says "magic" rather than "polygon." These four
# textures are billboarded ONTO that same geometry rather than replacing it:
# the motion, the light, the positioning system that fixed the smudge problem
# all stay exactly as they were.
#
# Source: Kenney "Particle Pack" (CC0), https://kenney.nl/assets/particle-pack
# The full pack is 15MB of mostly-unused frames; only these four are kept, at
# a fraction of their native 512x512 (soft gradients show no banding at 128,
# and nothing in this game's projectiles is drawn larger than a few dozen
# pixels across).
#
#   powershell -File tools/art/build_particles.ps1 <path to extracted pack>/PNG (Black background)

Add-Type -AssemblyName System.Drawing

$srcDir = $args[0]
if (-not $srcDir -or -not (Test-Path $srcDir)) {
  Write-Error "usage: build_particles.ps1 <path to Kenney Particle Pack>/PNG (Black background)"
  exit 1
}

$outDir = Join-Path $PSScriptRoot "..\..\client\public\assets\particles"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$target = 128

# out-name -> source frame
$picks = @{
  "glow.png"  = "light_01.png"   # soft radial burst - a bolt's hot core, a pillar's base
  "spark.png" = "star_04.png"    # crisp four-point sparkle - crit accents, magic pop
  "trail.png" = "trace_07.png"   # smooth tapered streak - the thing a fast projectile leaves behind
  "ring.png"  = "magic_02.png"   # a rune circle - what a mark/nova ring is actually FOR
}

foreach ($out in $picks.Keys) {
  $src = Join-Path $srcDir $picks[$out]
  if (-not (Test-Path $src)) {
    Write-Error "missing source frame: $src"
    continue
  }
  $img = [System.Drawing.Image]::FromFile($src)
  # trail.png rides a cone whose V axis runs along its LENGTH, not around it —
  # and the source frame's bright bar varies across X (U), constant down Y
  # (V), which would paint one side of the cone bright and the other dark
  # instead of fading the trail from the object to its tail. Rotating the
  # source a quarter turn before baking puts the gradient on the axis the
  # geometry actually reads, once, rather than fighting UV rotation at
  # runtime for a texture nothing else uses.
  if ($out -eq "trail.png") { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  $bmp = New-Object System.Drawing.Bitmap $target, $target
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($img, 0, 0, $target, $target)
  $g.Dispose()
  $img.Dispose()

  $dstPath = Join-Path $outDir $out
  $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "{0,-10} <- {1}" -f $out, $picks[$out]
}

"---"
"wrote to $outDir"
