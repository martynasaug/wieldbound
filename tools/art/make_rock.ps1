Add-Type -AssemblyName System.Drawing

$size = 16
$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::Transparent)

# Base rock silhouette (irregular hexagon-ish boulder), drawn as a polygon.
$outline = [System.Drawing.Color]::FromArgb(255, 46, 42, 41)
$dark    = [System.Drawing.Color]::FromArgb(255, 90, 88, 87)
$mid     = [System.Drawing.Color]::FromArgb(255, 128, 126, 124)
$light   = [System.Drawing.Color]::FromArgb(255, 168, 166, 162)
$hi      = [System.Drawing.Color]::FromArgb(255, 205, 203, 196)

$poly = @(
  New-Object System.Drawing.Point(3,13)
  New-Object System.Drawing.Point(2,10)
  New-Object System.Drawing.Point(3,7)
  New-Object System.Drawing.Point(6,4)
  New-Object System.Drawing.Point(10,3)
  New-Object System.Drawing.Point(13,5)
  New-Object System.Drawing.Point(14,9)
  New-Object System.Drawing.Point(13,12)
  New-Object System.Drawing.Point(10,14)
  New-Object System.Drawing.Point(6,14)
)

$brushDark = New-Object System.Drawing.SolidBrush($dark)
$g.FillPolygon($brushDark, $poly)

$penOutline = New-Object System.Drawing.Pen($outline, 1)
$g.DrawPolygon($penOutline, $poly)

# Mid-tone facet (upper-left, catches more light)
$facet1 = @(
  New-Object System.Drawing.Point(3,7)
  New-Object System.Drawing.Point(6,4)
  New-Object System.Drawing.Point(10,3)
  New-Object System.Drawing.Point(9,6)
  New-Object System.Drawing.Point(6,8)
  New-Object System.Drawing.Point(4,9)
)
$g.FillPolygon((New-Object System.Drawing.SolidBrush($mid)), $facet1)

# Highlight facet (small, upper-left-most)
$facet2 = @(
  New-Object System.Drawing.Point(6,4)
  New-Object System.Drawing.Point(9,4)
  New-Object System.Drawing.Point(8,6)
  New-Object System.Drawing.Point(6,7)
)
$g.FillPolygon((New-Object System.Drawing.SolidBrush($light)), $facet2)

$bmp.SetPixel(7,4,$hi)
$bmp.SetPixel(8,5,$hi)

# A couple of small crack/detail lines
$penCrack = New-Object System.Drawing.Pen($outline, 1)
$g.DrawLine($penCrack, 8, 8, 10, 11)
$g.DrawLine($penCrack, 5, 10, 6, 12)

$g.Dispose()
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outPath = Join-Path $root "client\public\assets\rock.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $outPath"
