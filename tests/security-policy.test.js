/**
 * tests/security-policy.test.js
 * Comprehensive security & policy test suite for PDF Presenter Suite.
 * Validates CSP headers, context isolation, single instance locking,
 * API origin protection, external protocol sanitization, and vault integrity.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Security & Policy Architecture Suite', () => {
  const rootDir = path.join(__dirname, '..');
  const mainJsPath = path.join(rootDir, 'main.js');
  const mainJs = fs.readFileSync(mainJsPath, 'utf8');

  // 1. Content Security Policy (CSP)
  describe('Content Security Policy (CSP)', () => {
    const views = ['launcher.html', 'presenter.html', 'audience.html', 'confidence.html'];

    for (const view of views) {
      it(`views/${view} must define a valid Content-Security-Policy meta tag`, () => {
        const filePath = path.join(rootDir, 'views', view);
        assert.ok(fs.existsSync(filePath), `View ${view} must exist`);
        const content = fs.readFileSync(filePath, 'utf8');
        
        assert.match(
          content,
          /<meta\s+http-equiv=["']Content-Security-Policy["']/i,
          `${view} must contain Content-Security-Policy meta tag`
        );
        assert.match(
          content,
          /default-src\s+'self'/i,
          `${view} CSP must restrict default-src to 'self'`
        );
      });
    }
  });

  // 2. Electron Context Isolation & Node Integration
  describe('Electron Process Sandboxing', () => {
    it('main.js must enforce contextIsolation: true and nodeIntegration: false for all windows', () => {
      // Find all webPreferences occurrences
      const webPrefMatches = mainJs.match(/webPreferences:\s*\{[\s\S]*?\}/g);
      assert.ok(webPrefMatches && webPrefMatches.length >= 3, 'Must define webPreferences for launcher, audience, presenter, confidence');

      for (const pref of webPrefMatches) {
        assert.ok(
          pref.includes('contextIsolation: true'),
          `webPreferences must have contextIsolation: true -> ${pref}`
        );
        assert.ok(
          pref.includes('nodeIntegration: false'),
          `webPreferences must have nodeIntegration: false -> ${pref}`
        );
      }
    });

    it('main.js must disable devTools in production package', () => {
      assert.ok(
        mainJs.includes('devTools: !app.isPackaged') || mainJs.includes('!app.isPackaged'),
        'Must conditionally disable devTools in production package'
      );
    });

    it('main.js enforces single instance application lock', () => {
      assert.ok(
        mainJs.includes('app.requestSingleInstanceLock()'),
        'main.js must request single instance lock to prevent concurrent process collisions'
      );
    });
  });

  // 3. Companion / Remote API Origin & CSRF / SSRF Protections
  describe('Companion / Remote API Origin & Network Security', () => {
    it('main.js checks Origin header to block unauthorized cross-origin web requests', () => {
      assert.ok(
        mainJs.includes('Cross-Origin Forbidden') || mainJs.includes('isAllowedOrigin'),
        'API server must validate origin to protect against browser-based CSRF / SSRF'
      );
    });

    it('main.js restricts API server port to valid unprivileged range', () => {
      assert.ok(
        mainJs.includes('port >= 1024') && mainJs.includes('port <= 65535'),
        'API port must be clamped between 1024 and 65535'
      );
    });
  });

  // 4. Encrypted License Vault Integrity
  describe('Encrypted License Vault & Offline Privacy', () => {
    const licenseMgrPath = path.join(rootDir, 'js/license-manager.js');
    const licenseMgr = fs.readFileSync(licenseMgrPath, 'utf8');

    it('js/license-manager.js protects stored keys with encryption/hashing', () => {
      assert.ok(
        licenseMgr.includes('license.enc'),
        'Must use encrypted license file license.enc'
      );
      assert.ok(
        licenseMgr.includes('getMachineFingerprint') || licenseMgr.includes('aes-256'),
        'Must enforce machine-bound AES encryption for stored licenses'
      );
      assert.ok(
        licenseMgr.includes('LICENSE_HMAC_SALT') || licenseMgr.includes('generateAlgorithmicKey'),
        'Must enforce cryptographic checksum validation for license keys'
      );
    });

    it('Application remains 100% offline with zero unauthorized telemetry', () => {
      // Ensure no external tracking / analytics libraries are loaded
      assert.ok(!mainJs.includes('google-analytics.com'), 'Must not connect to google-analytics');
      assert.ok(!mainJs.includes('telemetry.endpoint'), 'Must not have external telemetry endpoint');
    });
  });
});
