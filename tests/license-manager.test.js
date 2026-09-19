/**
 * tests/license-manager.test.js
 * Unit tests for PDF Presenter Suite License & IAP Manager
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { LicenseManager } = require('../js/license-manager.js');

describe('LicenseManager & In-App Purchase Entitlements', () => {
  let manager;

  beforeEach(() => {
    // Instantiate fresh instance for isolated testing
    manager = new LicenseManager();
    manager.resetToFree();
  });

  afterEach(() => {
    manager.resetToFree();
  });

  it('initializes in Free tier by default with Companion trial unstarted', () => {
    const status = manager.getPublicStatus();
    assert.equal(status.isPro, false);
    assert.equal(status.tier, 'free');
    assert.equal(status.companionAuthorized, false);
    assert.equal(status.trialActive, false);
    assert.equal(status.trialRemainingSeconds, 0);
  });

  it('validates and activates official algorithmic license keys', () => {
    const validKey = LicenseManager.generateAlgorithmicKey('USER-ENTERPRISE-1');
    assert.equal(manager.validateLicenseKey(validKey), true);

    const result = manager.activateLicenseKey(validKey);
    assert.equal(result.success, true);
    assert.equal(result.state.isPro, true);
    assert.equal(result.state.tier, 'pro');
    assert.equal(result.state.source, 'license_key');

    const status = manager.getPublicStatus();
    assert.equal(status.isPro, true);
    assert.equal(status.companionAuthorized, true);
  });

  it('validates developer and evaluation test keys', () => {
    const testKey = 'PRO-DEMO-TEST-2026-KEY1';
    assert.equal(manager.validateLicenseKey(testKey), true);

    const result = manager.activateLicenseKey(testKey);
    assert.equal(result.success, true);
    assert.equal(manager.getPublicStatus().isPro, true);
  });

  it('rejects malformed and forged license keys', () => {
    assert.equal(manager.validateLicenseKey(''), false);
    assert.equal(manager.validateLicenseKey('INVALID-KEY-123'), false);
    assert.equal(manager.validateLicenseKey('PRO-XXXX-YYYY-ZZZZ-WWWW'), false);
    assert.equal(manager.validateLicenseKey('PRO-1234-5678-9ABC-DEF0'), false);

    const activateResult = manager.activateLicenseKey('PRO-FORGED-KEY-0000');
    assert.equal(activateResult.success, false);
    assert.equal(activateResult.error, 'INVALID_KEY');
    assert.equal(manager.getPublicStatus().isPro, false);
  });

  it('manages 15-minute live trial for Companion API in Free mode', () => {
    assert.equal(manager.isCompanionApiAuthorized(), false);

    const trial = manager.startCompanionTrial();
    assert.equal(trial.success, true);
    assert.equal(manager.isCompanionApiAuthorized(), true);

    const status = manager.getPublicStatus();
    assert.equal(status.trialActive, true);
    assert.ok(status.trialRemainingSeconds > 0 && status.trialRemainingSeconds <= 900);
    assert.equal(status.isPro, false); // Still free tier, but trial authorized
  });

  it('persists encrypted license and recovers it on reload', () => {
    const validKey = 'PRO-STORE-VERIFIED-LIFETIME';
    manager.activateLicenseKey(validKey);
    assert.equal(manager.getPublicStatus().isPro, true);

    // Create new manager instance that reads from disk
    const reloadedManager = new LicenseManager();
    const status = reloadedManager.getPublicStatus();
    assert.equal(status.isPro, true);
    assert.equal(status.tier, 'pro');
  });

  it('resets cleanly back to Free tier when requested', () => {
    manager.activateLicenseKey('PRO-DEMO-TEST-2026-KEY1');
    assert.equal(manager.getPublicStatus().isPro, true);

    manager.resetToFree();
    assert.equal(manager.getPublicStatus().isPro, false);
    assert.equal(manager.getPublicStatus().tier, 'free');
  });

  it('generates verifiable keys via CLI script scripts/generate-license-key.js', () => {
    const { execSync } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate-license-key.js');
    const stdout = execSync(`node "${scriptPath}" "Enterprise Customer" --json`, { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);

    assert.equal(parsed.verified, true);
    assert.match(parsed.key, /^PRO-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.equal(manager.validateLicenseKey(parsed.key), true);

    // Ensure it can be activated in the license manager
    const activation = manager.activateLicenseKey(parsed.key);
    assert.equal(activation.success, true);
    assert.equal(manager.getPublicStatus().isPro, true);
  });

  it('allows rolling back to Free Community edition while safely preserving license key', () => {
    // 1. Activate a valid Pro license
    const validKey = 'PRO-STORE-VERIFIED-LIFETIME';
    manager.activateLicenseKey(validKey);
    let status = manager.getPublicStatus();
    assert.equal(status.isPro, true);
    assert.equal(status.activeEdition, 'pro');
    assert.equal(status.hasStoredKey, true);

    // 2. User rolls back to Free Community edition from About tab
    const freeRes = manager.setEdition('free');
    assert.equal(freeRes.success, true);
    assert.equal(freeRes.edition, 'free');

    status = manager.getPublicStatus();
    assert.equal(status.isPro, false, 'isPro should be false in Free edition');
    assert.equal(status.tier, 'free');
    assert.equal(status.activeEdition, 'free');
    assert.equal(status.suppressProPrompts, true, 'Sales prompts should be suppressed in Clean Free Mode');
    assert.equal(status.hasStoredKey, true, 'License key must remain safely stored in vault');

    // 3. User switches back to Pro edition from About tab
    const proRes = manager.setEdition('pro');
    assert.equal(proRes.success, true);
    assert.equal(proRes.edition, 'pro');

    status = manager.getPublicStatus();
    assert.equal(status.isPro, true, 'isPro should restore without re-entering key');
    assert.equal(status.tier, 'pro');
    assert.equal(status.activeEdition, 'pro');
    assert.equal(status.suppressProPrompts, false);
  });

  it('toggles between Free and Pro editions via toggleEdition()', () => {
    manager.activateLicenseKey('PRO-DEMO-TEST-2026-KEY1');
    assert.equal(manager.getPublicStatus().activeEdition, 'pro');

    manager.toggleEdition();
    assert.equal(manager.getPublicStatus().activeEdition, 'free');
    assert.equal(manager.getPublicStatus().isPro, false);

    manager.toggleEdition();
    assert.equal(manager.getPublicStatus().activeEdition, 'pro');
    assert.equal(manager.getPublicStatus().isPro, true);
  });

  it('forgets stored license key permanently when forgetStoredLicense is called', () => {
    manager.activateLicenseKey('PRO-STORE-VERIFIED-LIFETIME');
    assert.equal(manager.getPublicStatus().hasStoredKey, true);

    const forgetRes = manager.forgetStoredLicense();
    assert.equal(forgetRes.success, true);

    const status = manager.getPublicStatus();
    assert.equal(status.isPro, false);
    assert.equal(status.hasStoredKey, false);
    assert.equal(status.activeEdition, 'free');
  });

  it('strictly rejects switching to Pro edition when key is removed/missing (prevents keyless Pro bypass)', () => {
    // Ensure manager has no stored license key
    manager.forgetStoredLicense();
    assert.equal(manager.getPublicStatus().hasStoredKey, false);
    assert.equal(manager.getPublicStatus().isPro, false);

    // User attempts to select Enterprise Pro from About modal without a key
    const proRes = manager.setEdition('pro');
    assert.equal(proRes.success, false, 'setEdition(pro) must fail without a key');
    assert.equal(proRes.error, 'KEY_REQUIRED');

    // Verify state remains strictly Free
    const status = manager.getPublicStatus();
    assert.equal(status.isPro, false, 'isPro must remain false');
    assert.equal(status.tier, 'free');
    assert.equal(status.activeEdition, 'free');
  });
});

