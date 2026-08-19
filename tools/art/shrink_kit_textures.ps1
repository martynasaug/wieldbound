# Downscales the downloaded model kits' textures to something this game's
# camera can actually resolve.
#
# Both Quaternius MegaKits ship 2048x2048 atlases — bark and leaves for the
# nature kit, shared "trim" sheets for the props kit. They are stylised palette
# and gradient maps on low-poly meshes, and at our camera a whole tree covers a
# couple of hundred pixels, so 2048 is roughly sixteen times more texel than any
# of it can show. Shrinking to 512 took the nature folder from 42 MB to 4.4 MB
# and the props folder from 24 MB to about 2 MB, with no visible difference at
# any zoom the camera allows.
#
# Idempotent: anything already at or below the target is skipped, so re-running
# is safe and a second run reports every file as skipped.
#
#   powershell -File tools/art/shrink_kit_textures.ps1

Add-Type -AssemblyName System.Drawing

$target = 512
$dirs = @(
  (Join-Path $PSScriptRoot "..\..\client\public\models\nature"),
  (Join-Path $PSScriptRoot "..\..\client\public\models\props")
)

$before = 0
$after = 0

foreach ($dir in $dirs) {
  if (-not (Test-Path $dir)) {
    "skipping $dir (not present)"
    continue
  }
  "--- $(Split-Path $dir -Leaf) ---"

  Get-ChildItem (Join-Path $dir "*.png") | ForEach-Object {
    $path = $_.FullName
    $before += $_.Length

    $img = [System.Drawing.Image]::FromFile($path)
    $w = $img.Width; $h = $img.Height
    if ($w -le $target -and $h -le $target) {
      $img.Dispose()
      $after += $_.Length
      "{0,-38} {1}x{2}  skipped" -f $_.Name, $w, $h
      return
    }

    # Preserve aspect ratio: these are atlases, and stretching one to a square
    # would slide every UV island off its own artwork.
    $scale = [Math]::Min($target / $w, $target / $h)
    $nw = [Math]::Max(1, [int][Math]::Round($w * $scale))
    $nh = [Math]::Max(1, [int][Math]::Round($h * $scale))

    $bmp = New-Object System.Drawing.Bitmap $nw, $nh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose()
    $img.Dispose()

    # Write via a temp file: DrawImage holds the source open until Dispose, and
    # saving straight over the path it was read from throws on Windows.
    $tmp = "$path.tmp"
    $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Move-Item -Force $tmp $path

    $newLen = (Get-Item $path).Length
    $after += $newLen
    "{0,-38} {1}x{2} -> {3}x{4}  {5} KB" -f $_.Name, $w, $h, $nw, $nh, [int]($newLen / 1KB)
  }
}

""
"total {0:N1} MB -> {1:N1} MB" -f ($before / 1MB), ($after / 1MB)
