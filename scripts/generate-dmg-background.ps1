# ==============================================================================
# Generate macOS DMG Backgrounds (Standard 1x and Retina @2x)
# ==============================================================================

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "build"
$bgPath1x = Join-Path $outputDir "background.png"
$bgPath2x = Join-Path $outputDir "background@2x.png"

function Draw-DMG-Background([int]$width, [int]$height, [float]$scale, [string]$outputPath) {
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
    $fontTitle = New-Object System.Drawing.Font("Arial", (18 * $scale), [System.Drawing.FontStyle]::Bold)
    $fontSub = New-Object System.Drawing.Font("Arial", (10.5 * $scale), [System.Drawing.FontStyle]::Regular)
    $brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $brushSlate = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94a3b8"))

    $titleStr = "PDF Presenter Suite"
    $subStr = "Drag to Applications or run the 1-Click Setup Script below"
    $titleSize = $graphics.MeasureString($titleStr, $fontTitle)
    $subSize = $graphics.MeasureString($subStr, $fontSub)

    $graphics.DrawString($titleStr, $fontTitle, $brushWhite, ($width - $titleSize.Width) / 2, (18 * $scale))
    $graphics.DrawString($subStr, $fontSub, $brushSlate, ($width - $subSize.Width) / 2, (46 * $scale))

    # 3. Arrow pointing from left icon (x=160) to right icon (x=500)
    $penArrow = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"), (3 * $scale))
    $penArrow.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap((6 * $scale), (6 * $scale), $true)
    $graphics.DrawLine($penArrow, (240 * $scale), (135 * $scale), (420 * $scale), (135 * $scale))

    $fontArrow = New-Object System.Drawing.Font("Arial", (8.5 * $scale), [System.Drawing.FontStyle]::Bold)
    $brushCyan = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#38bdf8"))
    $arrowLabel = "DRAG TO INSTALL"
    $arrowLabelSize = $graphics.MeasureString($arrowLabel, $fontArrow)
    $graphics.DrawString($arrowLabel, $fontArrow, $brushCyan, ($width - $arrowLabelSize.Width) / 2, (116 * $scale))

    # 4. Helper text labels for row 2 (x=220: README, x=440: Script)
    $fontBadge = New-Object System.Drawing.Font("Arial", (8.5 * $scale), [System.Drawing.FontStyle]::Regular)
    $brushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94a3b8"))

    $readMeLabel = "📄 Setup Notes"
    $readMeLabelSize = $graphics.MeasureString($readMeLabel, $fontBadge)
    $graphics.DrawString($readMeLabel, $fontBadge, $brushMuted, (220 * $scale) - ($readMeLabelSize.Width / 2), (318 * $scale))

    $scriptLabel = "⚡ 1-Click Auto Setup"
    $scriptLabelSize = $graphics.MeasureString($scriptLabel, $fontBadge)
    $graphics.DrawString($scriptLabel, $fontBadge, $brushCyan, (440 * $scale) - ($scriptLabelSize.Width / 2), (318 * $scale))

    # 5. Bottom instruction card
    $cardX = 30 * $scale
    $cardY = 352 * $scale
    $cardW = ($width - (60 * $scale))
    $cardH = 100 * $scale
    $cardRect = New-Object System.Drawing.Rectangle($cardX, $cardY, $cardW, $cardH)
    $cardBg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#1e293b"))
    $cardBorder = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml("#334155"), (1 * $scale))

    $graphics.FillRectangle($cardBg, $cardRect)
    $graphics.DrawRectangle($cardBorder, $cardRect)

    $fontTipTitle = New-Object System.Drawing.Font("Arial", (9.5 * $scale), [System.Drawing.FontStyle]::Bold)
    $fontTipBody = New-Object System.Drawing.Font("Arial", (8.5 * $scale), [System.Drawing.FontStyle]::Regular)
    $brushBody = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#e2e8f0"))

    $graphics.DrawString("💡 macOS First-Launch Options (100% Free / Open-Source):", $fontTipTitle, $brushCyan, ($cardX + (16 * $scale)), ($cardY + (12 * $scale)))
    $tipLine1 = "• Option A (1-Click): Double-click 'Install.command' (or Right-Click ➔ Open) to auto-setup."
    $tipLine2 = "• Option B (Manual): Drag app to Applications ➔ In Applications, Right-Click app ➔ Choose 'Open'."
    $tipLine3 = "  Once opened, macOS permanently whitelists PDF Presenter Suite on your Mac."
    $graphics.DrawString($tipLine1, $fontTipBody, $brushBody, ($cardX + (16 * $scale)), ($cardY + (36 * $scale)))
    $graphics.DrawString($tipLine2, $fontTipBody, $brushBody, ($cardX + (16 * $scale)), ($cardY + (56 * $scale)))
    $graphics.DrawString($tipLine3, $fontTipBody, $brushSlate, ($cardX + (16 * $scale)), ($cardY + (76 * $scale)))

    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bitmap.Dispose()
    Write-Host "Created DMG background: $outputPath ($width x $height, scale=${scale}x)"
}

# Generate 1x (660 x 480) and 2x Retina (1320 x 960)
Draw-DMG-Background 660 480 1.0 $bgPath1x
Draw-DMG-Background 1320 960 2.0 $bgPath2x
