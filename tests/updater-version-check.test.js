/**
 * tests/updater-version-check.test.js
 * Verification suite for update comparison logic and downgrade prevention.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function parseSemver(v) {
  if (!v) return [0, 0, 0];
  const cleaned = v.replace(/^v/, '').trim();
  return cleaned.split('.').map(num => parseInt(num, 10) || 0);
}

function isNewerVersion(latest, current) {
  const [lMaj, lMin, lPat] = parseSemver(latest);
  const [cMaj, cMin, cPat] = parseSemver(current);
  if (lMaj > cMaj) return true;
  if (lMaj === cMaj && lMin > cMin) return true;
  if (lMaj === cMaj && lMin === cMin && lPat > cPat) return true;
  return false;
}

describe('Update Version Checker & Downgrade Prevention', () => {
  it('correctly compares version numbers and rejects downgrades and identical versions', () => {
    // Testing version 1.2.5 vs Git release 1.2.4
    assert.equal(isNewerVersion('1.2.4', '1.2.5'), false, '1.2.4 is not newer than installed 1.2.5');
    assert.equal(isNewerVersion('v1.2.4', '1.2.5'), false, 'v1.2.4 is not newer than installed 1.2.5');

    // Same version
    assert.equal(isNewerVersion('1.2.5', '1.2.5'), false, '1.2.5 is identical to installed 1.2.5');
    assert.equal(isNewerVersion('v1.2.5', '1.2.5'), false, 'v1.2.5 is identical to installed 1.2.5');

    // Actual update available
    assert.equal(isNewerVersion('1.2.6', '1.2.5'), true, '1.2.6 is newer than 1.2.5');
    assert.equal(isNewerVersion('1.3.0', '1.2.5'), true, '1.3.0 is newer than 1.2.5');
    assert.equal(isNewerVersion('2.0.0', '1.2.5'), true, '2.0.0 is newer than 1.2.5');
  });

  it('main.js guards check-for-updates so directDownloadUrl is empty when not a newer version', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(
      mainJs.includes('if (hasUpdate)') && mainJs.includes("directDownloadUrl = ''"),
      'main.js must only populate directDownloadUrl when hasUpdate is true'
    );
  });

  it('main.js guards download-update against downloading equal or lower versions', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(
      mainJs.includes("if (!isNewerVersion(latestVersion, currentVersion))"),
      'main.js download-update must verify isNewerVersion before downloading'
    );
  });

  it('launcher.js only stores availableDirectDownloadUrl if hasUpdate is true', () => {
    const launcherJs = fs.readFileSync(path.join(__dirname, '../js/launcher.js'), 'utf8');
    assert.ok(
      launcherJs.includes("availableDirectDownloadUrl = info.hasUpdate ? (info.directDownloadUrl || '') : null;"),
      'launcher.js must nullify availableDirectDownloadUrl when hasUpdate is false'
    );
  });
});
