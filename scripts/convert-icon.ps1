$src = 'C:\Users\user\.gemini\antigravity\brain\41ac0ba7-4074-4827-af2a-a36e576a623d\app_icon_1788357082674.jpg'
$dst = 'C:\Users\user\.gemini\antigravity\scratch\pdf-presenter\build\icon.png'
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($src)
$image.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
$image.Dispose()
Write-Host "Success: Converted to valid PNG ($dst)"
