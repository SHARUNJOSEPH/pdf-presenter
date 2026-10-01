#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd, desc) {
  console.log(`\n➡️  ${desc}...`);
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function getNextVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3) throw new Error(`Invalid semver: ${current}`);
  if (type === 'patch') parts[2]++;
  else if (type === 'minor') { parts[1]++; parts[2] = 0; }
  else if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else {
    if (!/^\d+\.\d+\.\d+$/.test(type)) {
      throw new Error(`Target version must be major, minor, patch, or X.Y.Z (got: ${type})`);
    }
    return type;
  }
  return parts.join('.');
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;

  const targetArg = process.argv[2];
  if (!targetArg) {
    console.error('Usage: npm run release <patch|minor|major|X.Y.Z>');
    console.error(`Current version is: ${currentVersion}`);
    process.exit(1);
  }

  const newVersion = getNextVersion(currentVersion, targetArg);
  console.log(`\n🚀 Preparing Release: v${currentVersion} ➔ v${newVersion}\n`);

  // 1. Run tests first to ensure safety
  run('npm test', 'Running automated test suite');

  // 2. Update package.json
  console.log(`\n➡️  Updating package.json to ${newVersion}...`);
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 3. Update README.md links
  const readmePath = path.join(rootDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    console.log(`➡️  Updating README.md links from ${currentVersion} to ${newVersion}...`);
    let readme = fs.readFileSync(readmePath, 'utf8');
    const escapedCurrent = currentVersion.replace(/\./g, '\\.');
    const regex = new RegExp(escapedCurrent, 'g');
    readme = readme.replace(regex, newVersion);
    fs.writeFileSync(readmePath, readme, 'utf8');
  }

  // 4. Git commit and tag
  run(`git add package.json README.md`, 'Staging updated files');
  run(`git commit -m "chore(release): bump version to ${newVersion}"`, 'Committing release bump');
  run(`git tag -a v${newVersion} -m "Release v${newVersion}"`, `Creating git tag v${newVersion}`);

  console.log(`\n🎉 Release v${newVersion} prepared successfully!`);
  console.log(`\nTo publish and trigger automated GitHub Release build & in-app updates across all devices, run:`);
  console.log(`\n   git push origin main ; git push origin v${newVersion}\n`);
}

main();
