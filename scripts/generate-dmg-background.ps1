# ==============================================================================
# Generate Custom macOS DMG Background with Drag & Drop and Launch Instructions
# ==============================================================================

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "build"
$bgPath = Join-Path $outputDir "background.png"

$width = 600
$height = 420

$bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# 1. Background gradient (sleek dark slate matching app theme)
$bgColor1 = [System.Drawing.ColorTranslator]::FromHtml("#0b0f19")
$bgColor2 = [System.Drawing.ColorTranslator]::FromHtml("#111827")
$rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $bgColor1, $bgColor2, 90.0)
$graphics.FillRectangle($brush, $rect)

# 2. Header text
$fontTitle = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold)
$fontSub = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Regular)
$brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$brushSlate = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94a3b8"))

$titleStr = "PDF Presenter Suite"
$subStr = "Drag to Applications to install"
$titleSize = $graphics.MeasureString($titleStr, $fontTitle)
$subSize = $graphics.MeasureString($subStr, $fontSub)

$graphics.DrawString($titleStr, $fontTitle, $brushWhite, ($width - $titleSize.Width) / 2, 28)
$graphics.DrawString($subStr, $fontSub, $brushSlate, ($width - $subSize.Width) / 2, 58)

# 3. Arrow pointing from left icon (x=150) to right icon (x=450)
$penArrow = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"), 3)
$penArrow.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap(6, 6, $true)
$graphics.DrawLine($penArrow, 230, 190, 370, 190)

# 4. Bottom instruction card
$cardY = 320
$cardH = 75
$cardRect = New-Object System.Drawing.Rectangle(30, $cardY, 540, $cardH)
$cardBg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1e293b"))
$cardBorder = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#334155"), 1)

$graphics.FillRectangle($cardBg, $cardRect)
$graphics.DrawRectangle($cardBorder, $cardRect)

$fontTipTitle = New-Object System.Drawing.Font("Arial", 9.5, [System.Drawing.FontStyle]::Bold)
$fontTipBody = New-Object System.Drawing.Font("Arial", 8.5, [System.Drawing.FontStyle]::Regular)
$brushCyan = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"))
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#cbd5e1"))

$graphics.DrawString("💡 macOS First-Launch Tip:", $fontTipTitle, $brushCyan, 45, $cardY + 12)
$tipLine1 = "Right-Click (Control-Click) 'PDF Presenter Suite' in Applications and choose 'Open'."
$tipLine2 = "Click 'Open' on the confirmation prompt to permanently trust the application."
$graphics.DrawString($tipLine1, $fontTipBody, $brushMuted, 45, $cardY + 32)
$graphics.DrawString($tipLine2, $fontTipBody, $brushMuted, 45, $cardY + 50)

$bitmap.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Created DMG background: $bgPath ($width x $height)"
