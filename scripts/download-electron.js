// scripts/download-electron.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const version = 'v44.1.0';
const url = `https://github.com/electron/electron/releases/download/${version}/electron-${version}-win32-x64.zip`;
const destZip = path.join(__dirname, 'electron.zip');
const distDir = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');

console.log(`Downloading Electron ${version} from ${url}...`);

function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  https.get(url, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      console.log('Following redirect to:', response.headers.location);
      return download(response.headers.location, dest, cb);
    }
    response.pipe(file);
    file.on('finish', () => {
      file.close(cb);
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    if (cb) cb(err);
  });
}

download(url, destZip, (err) => {
  if (err) {
    console.error('Download error:', err);
    process.exit(1);
  }
  console.log('Download complete. Extracting to dist...');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  try {
    execSync(`tar -xf "${destZip}" -C "${distDir}"`);
  } catch (e) {
    execSync(`powershell -Command "Expand-Archive -Path '${destZip}' -DestinationPath '${distDir}' -Force"`);
  }

  fs.unlinkSync(destZip);
  fs.writeFileSync(path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt'), 'electron.exe');
  console.log('Electron successfully installed and ready!');
});
