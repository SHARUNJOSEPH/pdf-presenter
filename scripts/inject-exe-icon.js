// scripts/inject-exe-icon.js
// Custom afterPack hook for electron-builder to inject app icon into the Windows executable
// safely without invoking wine or failing on Windows unsigned builds.

const fs = require('fs');
const path = require('path');
const resedit = require('resedit');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'win32') return;

  const appOutDir = context.appOutDir;
  const exePath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
    console.warn('[inject-exe-icon] Missing exe or icon:', { exePath, iconPath });
    return;
  }

  try {
    console.log('[inject-exe-icon] Injecting custom icon into Windows executable:', exePath);
    const exeData = fs.readFileSync(exePath);
    const exe = resedit.NtExecutable.from(exeData);
    const res = resedit.NtExecutableResource.from(exe);
    const icoData = fs.readFileSync(iconPath);
    const iconFile = resedit.Data.IconFile.from(icoData);

    resedit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      1033,
      iconFile.icons.map(item => item.data)
    );

    res.outputResource(exe);
    const outBuf = Buffer.from(exe.generate());
    fs.writeFileSync(exePath, outBuf);
    console.log('[inject-exe-icon] ✅ Custom application icon successfully embedded into executable!');
  } catch (err) {
    console.error('[inject-exe-icon] ❌ Failed to embed icon into executable:', err);
  }
};
