Add-Type -AssemblyName System.Drawing

function Resize-Image($sourcePath, $destPath, $targetWidth, $targetHeight) {
    $src = [System.Drawing.Image]::FromFile($sourcePath)
    $dest = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, 0, 0, $targetWidth, $targetHeight)
    $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Host "Created: $destPath ($targetWidth x $targetHeight)"
}

$rootDir = Split-Path -Parent $PSScriptRoot
$iconSrc = Join-Path $rootDir "build\icon.png"
$socialDir = Join-Path $rootDir "social-assets"

# 1. 1:1 App Tile Icon (300 x 300)
Resize-Image $iconSrc (Join-Path $socialDir "store-app-tile-300x300.png") 300 300

# 2. 9:16 Poster Art (1440 x 2160) from 720x1080
$posterSrc = Join-Path $socialDir "store-poster-art-720x1080.png"
if (Test-Path $posterSrc) {
    Resize-Image $posterSrc (Join-Path $socialDir "store-poster-art-1440x2160.png") 1440 2160
}
