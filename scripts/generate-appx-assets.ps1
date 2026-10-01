# ==============================================================================
# Generate Custom Microsoft Store Tile Assets from build/icon.png
# Resolves Certification Policy 10.1.1.11 (On Device Tiles)
# ==============================================================================

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceIconPath = Join-Path $projectRoot "build\icon.png"
$outputDir = Join-Path $projectRoot "build\appx"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if (-not (Test-Path $sourceIconPath)) {
    Write-Error "Source icon not found at $sourceIconPath"
    exit 1
}

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($sourceIconPath)
$bgDarkColor = [System.Drawing.ColorTranslator]::FromHtml("#0b0f19")

# Helper function to resize with high quality bicubic interpolation
function Save-ResizedSquare($targetWidth, $targetHeight, $fileName) {
    $targetPath = Join-Path $outputDir $fileName
    $destBitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    
    $graphics.DrawImage($sourceBitmap, 0, 0, $targetWidth, $targetHeight)
    
    $destBitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $destBitmap.Dispose()
    Write-Host "Created: $fileName ($targetWidth x $targetHeight)"
}

# Helper function for wide canvas tiles (e.g. 310x150, 620x300) with centered icon & title
function Save-WideTile($width, $height, $fileName, $includeText = $true) {
    $targetPath = Join-Path $outputDir $fileName
    $destBitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Fill with sleek dark theme background
    $graphics.Clear($bgDarkColor)
    
    if ($includeText) {
        # Icon on left, elegant title on right
        $iconPadding = [math]::Round($height * 0.12)
        $iconSize = $height - ($iconPadding * 2)
        $graphics.DrawImage($sourceBitmap, $iconPadding, $iconPadding, $iconSize, $iconSize)
        
        $fontSize = [math]::Round($height * 0.16)
        $subFontSize = [math]::Round($height * 0.09)
        $fontFamily = "Segoe UI"
        
        $titleFont = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
        $subFont = New-Object System.Drawing.Font($fontFamily, $subFontSize, [System.Drawing.FontStyle]::Regular)
        $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $cyanBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"))
        
        $textX = $iconPadding + $iconSize + [math]::Round($height * 0.1)
        $textY1 = [math]::Round($height * 0.32)
        $textY2 = $textY1 + $fontSize + 8
        
        $graphics.DrawString("PDF Presenter Suite", $titleFont, $textBrush, $textX, $textY1)
        $graphics.DrawString("Pro Dual-Screen Cockpit", $subFont, $cyanBrush, $textX, $textY2)
        
        $titleFont.Dispose()
        $subFont.Dispose()
        $textBrush.Dispose()
        $cyanBrush.Dispose()
    } else {
        # Centered icon
        $iconPadding = [math]::Round($height * 0.15)
        $iconSize = $height - ($iconPadding * 2)
        $iconX = [math]::Round(($width - $iconSize) / 2)
        $graphics.DrawImage($sourceBitmap, $iconX, $iconPadding, $iconSize, $iconSize)
    }
    
    $destBitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $destBitmap.Dispose()
    Write-Host "Created: $fileName ($width x $height)"
}

Write-Host "Generating custom Microsoft Store AppX visual assets from $sourceIconPath..."

# 1. Base AppX Manifest Assets required by electron-builder
Save-ResizedSquare 44 44 "Square44x44Logo.png"
Save-ResizedSquare 150 150 "Square150x150Logo.png"
Save-ResizedSquare 310 310 "Square310x310Logo.png"
Save-ResizedSquare 50 50 "StoreLogo.png"
Save-WideTile 310 150 "Wide310x150Logo.png" $true
Save-WideTile 620 300 "SplashScreen.png" $true

# 2. Base scale-100 explicit assets
Save-ResizedSquare 44 44 "Square44x44Logo.scale-100.png"
Save-ResizedSquare 150 150 "Square150x150Logo.scale-100.png"
Save-ResizedSquare 310 310 "Square310x310Logo.scale-100.png"
Save-ResizedSquare 50 50 "StoreLogo.scale-100.png"
Save-WideTile 310 150 "Wide310x150Logo.scale-100.png" $true
Save-WideTile 620 300 "SplashScreen.scale-100.png" $true

# 3. High-DPI Scaled Variations for Start Menu, Taskbar & Surface Laptop (scale-200, scale-400)
Save-ResizedSquare 88 88 "Square44x44Logo.scale-200.png"
Save-ResizedSquare 176 176 "Square44x44Logo.scale-400.png"

# Targetsize unplated (transparent background)
Save-ResizedSquare 16 16 "Square44x44Logo.targetsize-16_altform-unplated.png"
Save-ResizedSquare 24 24 "Square44x44Logo.targetsize-24_altform-unplated.png"
Save-ResizedSquare 32 32 "Square44x44Logo.targetsize-32_altform-unplated.png"
Save-ResizedSquare 44 44 "Square44x44Logo.targetsize-44_altform-unplated.png"
Save-ResizedSquare 48 48 "Square44x44Logo.targetsize-48_altform-unplated.png"
Save-ResizedSquare 256 256 "Square44x44Logo.targetsize-256_altform-unplated.png"

# Targetsize plated (taskbar / start menu list)
Save-ResizedSquare 16 16 "Square44x44Logo.targetsize-16.png"
Save-ResizedSquare 24 24 "Square44x44Logo.targetsize-24.png"
Save-ResizedSquare 32 32 "Square44x44Logo.targetsize-32.png"
Save-ResizedSquare 44 44 "Square44x44Logo.targetsize-44.png"
Save-ResizedSquare 48 48 "Square44x44Logo.targetsize-48.png"
Save-ResizedSquare 256 256 "Square44x44Logo.targetsize-256.png"

# Medium & Large Tile Scaled Variations (Surface Laptop high DPI)
Save-ResizedSquare 300 300 "Square150x150Logo.scale-200.png"
Save-ResizedSquare 600 600 "Square150x150Logo.scale-400.png"
Save-ResizedSquare 620 620 "Square310x310Logo.scale-200.png"

# Store & Wide Tile Scaled Variations
Save-ResizedSquare 100 100 "StoreLogo.scale-200.png"
Save-ResizedSquare 200 200 "StoreLogo.scale-400.png"
Save-WideTile 620 300 "Wide310x150Logo.scale-200.png" $true
Save-WideTile 1240 600 "Wide310x150Logo.scale-400.png" $true
Save-WideTile 1240 600 "SplashScreen.scale-200.png" $true

$sourceBitmap.Dispose()
Write-Host "All Microsoft Store tile assets generated successfully in $outputDir"
