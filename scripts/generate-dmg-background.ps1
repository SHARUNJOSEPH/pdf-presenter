# ==============================================================================
# Generate Custom macOS DMG Background with Drag & Drop, ReadMe & First-Launch Guide
# ==============================================================================

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "build"
$bgPath = Join-Path $outputDir "background.png"

$width = 640
$height = 450

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
$fontSub = New-Object System.Drawing.Font("Arial", 10.5, [System.Drawing.FontStyle]::Regular)
$brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$brushSlate = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94a3b8"))

$titleStr = "PDF Presenter Suite"
$subStr = "Drag the app to Applications, then read setup instructions below"
$titleSize = $graphics.MeasureString($titleStr, $fontTitle)
$subSize = $graphics.MeasureString($subStr, $fontSub)

$graphics.DrawString($titleStr, $fontTitle, $brushWhite, ($width - $titleSize.Width) / 2, 22)
$graphics.DrawString($subStr, $fontSub, $brushSlate, ($width - $subSize.Width) / 2, 50)

# 3. Arrow pointing from left icon (x=140) to right icon (x=500)
$penArrow = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"), 3)
$penArrow.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap(6, 6, $true)
$graphics.DrawLine($penArrow, 220, 155, 420, 155)

$fontArrow = New-Object System.Drawing.Font("Arial", 9, [System.Drawing.FontStyle]::Bold)
$brushCyan = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"))
$arrowLabel = "DRAG TO INSTALL"
$arrowLabelSize = $graphics.MeasureString($arrowLabel, $fontArrow)
$graphics.DrawString($arrowLabel, $fontArrow, $brushCyan, ($width - $arrowLabelSize.Width) / 2, 134)

# 4. ReadMe Guide note (for the icon at x=320, y=260)
$fontReadMeTip = New-Object System.Drawing.Font("Arial", 8.5, [System.Drawing.FontStyle]::Regular)
$brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94a3b8"))
$readMeHint = "Double-click READ_ME_FIRST.txt below for Gatekeeper fix"
$readMeHintSize = $graphics.MeasureString($readMeHint, $fontReadMeTip)
$graphics.DrawString($readMeHint, $fontReadMeTip, $brushMuted, ($width - $readMeHintSize.Width) / 2, 316)

# 5. Bottom instruction card
$cardY = 346
$cardH = 82
$cardRect = New-Object System.Drawing.Rectangle(30, $cardY, ($width - 60), $cardH)
$cardBg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1e293b"))
$cardBorder = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#334155"), 1)

$graphics.FillRectangle($cardBg, $cardRect)
$graphics.DrawRectangle($cardBorder, $cardRect)

$fontTipTitle = New-Object System.Drawing.Font("Arial", 9.5, [System.Drawing.FontStyle]::Bold)
$fontTipBody = New-Object System.Drawing.Font("Arial", 8.5, [System.Drawing.FontStyle]::Regular)
$brushBody = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#e2e8f0"))

$graphics.DrawString("💡 macOS First-Launch Notice (100% Free / Open-Source):", $fontTipTitle, $brushCyan, 45, $cardY + 10)
$tipLine1 = "In Applications, Right-Click (Control-Click) 'PDF Presenter Suite' ➔ Choose 'Open'."
$tipLine2 = "Click 'Open' in the dialog. Once opened, macOS permanently trusts the app!"
$graphics.DrawString($tipLine1, $fontTipBody, $brushBody, 45, $cardY + 32)
$graphics.DrawString($tipLine2, $fontTipBody, $brushBody, 45, $cardY + 52)

$bitmap.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Created DMG background: $bgPath ($width x $height)"
