/**
 * license-manager.js - Enterprise License & In-App Purchase (IAP) Manager
 * PDF Presenter Suite
 *
 * Implements:
 * - Free Tier vs Pro Tier feature entitlement management
 * - Microsoft Store IAP trigger (ms-windows-store deep-links)
 * - Cryptographic HMAC-SHA256 offline license key verification
 * - Machine-bound AES-256 encrypted license persistence
 * - 15-minute live trial engine for Bitfocus Companion API
 * - Developer & CI override support
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
let electronModule = null;
try {
  electronModule = require('electron');
} catch (e) {
  // Graceful fallback when run in standalone node:test environment
}

// Microsoft Store Product & Add-On Identifiers
// Main App Store ID: 9NS3LKFXHBXW
// Add-On Durable Product ID configured in Partner Center
const DEFAULT_STORE_PRODUCT_ID = '9NS3LKFXHBXW';
const PRO_ADDON_STORE_ID = process.env.STORE_PRO_ADDON_ID || 'PDFPresenterSuite.ProLifetime';

// Cryptographic Salt for Offline License Key Verification (HMAC-SHA256)
const LICENSE_HMAC_SALT = 'PDF_PRESENTER_SUITE_ENTERPRISE_KEY_SALT_2026_V1';

// 15-Minute Trial Duration for Bitfocus Companion API in Free Mode
const TRIAL_DURATION_MS = 15 * 60 * 1000;

class LicenseManager {
  constructor() {
    this.state = {
      isPro: false,
      tier: 'free', // 'free' | 'pro'
      source: null, // 'store' | 'license_key' | 'trial' | 'dev_override'
      activatedAt: null,
      licenseKey: null,
      trialStartedAt: null,
      trialActive: false
    };

    this.listeners = new Set();
    this.init();
  }

  /**
   * Derive a stable, machine-specific secret encryption key
   */
  getMachineFingerprint() {
    try {
      const parts = [
        os.hostname(),
        os.platform(),
        os.arch(),
        os.userInfo ? (os.userInfo().username || 'user') : 'user'
      ];
      return crypto.createHash('sha256').update(parts.join('::')).digest();
    } catch (e) {
      return crypto.createHash('sha256').update('fallback-machine-id').digest();
    }
  }

  /**
   * Get path to the encrypted license file
   */
  getLicenseFilePath() {
    try {
      const appObj = electronModule && electronModule.app ? electronModule.app : null;
      const userData = appObj && typeof appObj.getPath === 'function' ? appObj.getPath('userData') : path.join(__dirname, '..');
      return path.join(userData, 'license.enc');
    } catch (e) {
      return path.join(__dirname, '..', '.license.enc');
    }
  }

  /**
   * Initialize and load existing license entitlement
   */
  init() {
    // 1. Check for Developer / CI environment override
    if (process.env.PDF_PRESENTER_PRO === 'true' || process.env.CI_PRO_LICENSE === 'true') {
      this.state.isPro = true;
      this.state.tier = 'pro';
      this.state.source = 'dev_override';
      this.state.activatedAt = new Date().toISOString();
      return;
    }

    // 2. Load stored encrypted license if present
    this.loadStoredLicense();
  }

  /**
   * Encrypt and store license data to disk
   */
  saveStoredLicense() {
    try {
      const filePath = this.getLicenseFilePath();
      const rawPayload = JSON.stringify({
        isPro: this.state.isPro,
        tier: this.state.tier,
        source: this.state.source,
        activatedAt: this.state.activatedAt,
        licenseKey: this.state.licenseKey
      });

      const key = this.getMachineFingerprint();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(rawPayload, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const fileData = JSON.stringify({
        iv: iv.toString('hex'),
        data: encrypted,
        checksum: crypto.createHmac('sha256', key).update(encrypted).digest('hex')
      });

      fs.writeFileSync(filePath, fileData, 'utf8');
    } catch (e) {
      console.warn('[LicenseManager] Failed to save encrypted license:', e.message);
    }
  }

  /**
   * Load and decrypt license data from disk
   */
  loadStoredLicense() {
    try {
      const filePath = this.getLicenseFilePath();
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const fileRaw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileRaw);
      if (!parsed.iv || !parsed.data || !parsed.checksum) {
        return false;
      }

      const key = this.getMachineFingerprint();
      const expectedChecksum = crypto.createHmac('sha256', key).update(parsed.data).digest('hex');
      if (expectedChecksum !== parsed.checksum) {
        console.warn('[LicenseManager] License file checksum mismatch (tampered or machine mismatch). Resetting to Free.');
        return false;
      }

      const iv = Buffer.from(parsed.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);
      if (data.isPro && data.tier === 'pro') {
        this.state.isPro = true;
        this.state.tier = 'pro';
        this.state.source = data.source || 'license_key';
        this.state.activatedAt = data.activatedAt || new Date().toISOString();
        this.state.licenseKey = data.licenseKey || null;
        return true;
      }
    } catch (e) {
      console.warn('[LicenseManager] Could not read stored license:', e.message);
    }
    return false;
  }

  /**
   * Verify an offline cryptographic license key
   * Accepts:
   * 1. Official algorithmic keys (PRO-XXXX-XXXX-XXXX-XXXX)
   * 2. Developer/Evaluation test keys: PRO-DEMO-TEST-2026-KEY1, PRO-LIFETIME-ENTERPRISE-2026
   */
  validateLicenseKey(key) {
    if (!key || typeof key !== 'string') return false;
    const cleanKey = key.trim().toUpperCase();

    // Recognized Developer/Evaluation test keys
    const testKeys = [
      'PRO-DEMO-TEST-2026-KEY1',
      'PRO-LIFETIME-ENTERPRISE-2026',
      'PRO-STORE-VERIFIED-LIFETIME'
    ];
    if (testKeys.includes(cleanKey)) {
      return true;
    }

    // Format check: PRO-4HEX-4HEX-4HEX-4HEX
    const pattern = /^PRO-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
    if (!pattern.test(cleanKey)) {
      return false;
    }

    // Check against algorithmic validation (checksum of segments)
    const parts = cleanKey.replace(/^PRO-/, '').split('-');
    const hexConcat = parts.join('');
    // First 12 chars are payload, last 4 chars are checksum
    const payload = hexConcat.substring(0, 12);
    const expectedChecksum = crypto.createHmac('sha256', LICENSE_HMAC_SALT)
      .update(payload)
      .digest('hex')
      .substring(0, 4)
      .toUpperCase();

    return hexConcat.substring(12, 16) === expectedChecksum;
  }

  /**
   * Generate an algorithmic key where payload + checksum matches validateLicenseKey
   */
  static generateAlgorithmicKey(seed = 'PRO-SUITE') {
    const rawPayload = crypto.createHash('md5').update(seed + Date.now().toString()).digest('hex').substring(0, 12).toUpperCase();
    const checksum = crypto.createHmac('sha256', LICENSE_HMAC_SALT)
      .update(rawPayload)
      .digest('hex')
      .substring(0, 4)
      .toUpperCase();
    const full = rawPayload + checksum;
    return `PRO-${full.substring(0,4)}-${full.substring(4,8)}-${full.substring(8,12)}-${full.substring(12,16)}`;
  }

  /**
   * Activate a license key
   */
  activateLicenseKey(key) {
    if (!this.validateLicenseKey(key)) {
      return { success: false, error: 'INVALID_KEY' };
    }

    this.state.isPro = true;
    this.state.tier = 'pro';
    this.state.source = 'license_key';
    this.state.licenseKey = key.trim().toUpperCase();
    this.state.activatedAt = new Date().toISOString();

    this.saveStoredLicense();
    this.emitChange();

    return {
      success: true,
      state: this.getPublicStatus()
    };
  }

  /**
   * Reset license to Free (e.g. for testing)
   */
  resetToFree() {
    this.state.isPro = false;
    this.state.tier = 'free';
    this.state.source = null;
    this.state.licenseKey = null;
    this.state.activatedAt = null;
    this.state.trialStartedAt = null;
    this.state.trialActive = false;

    try {
      const filePath = this.getLicenseFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {}

    this.emitChange();
    return this.getPublicStatus();
  }

  /**
   * Start 15-minute live trial for Bitfocus Companion API in Free mode
   */
  startCompanionTrial() {
    if (this.state.isPro) {
      return { success: true, isPro: true, message: 'Pro already unlocked' };
    }

    this.state.trialStartedAt = Date.now();
    this.state.trialActive = true;
    this.emitChange();

    return {
      success: true,
      trialStartedAt: this.state.trialStartedAt,
      remainingSeconds: Math.round(TRIAL_DURATION_MS / 1000)
    };
  }

  /**
   * Check if Bitfocus Companion API is authorized
   * Returns true if Pro unlocked OR trial is actively within 15 minutes
   */
  isCompanionApiAuthorized() {
    if (this.state.isPro) return true;
    if (!this.state.trialStartedAt) return false;

    const elapsed = Date.now() - this.state.trialStartedAt;
    if (elapsed < TRIAL_DURATION_MS) {
      return true;
    }

    this.state.trialActive = false;
    return false;
  }

  /**
   * Get remaining trial seconds
   */
  getTrialRemainingSeconds() {
    if (this.state.isPro) return -1; // Unlimited
    if (!this.state.trialStartedAt) return 0;
    const remainingMs = Math.max(0, TRIAL_DURATION_MS - (Date.now() - this.state.trialStartedAt));
    return Math.ceil(remainingMs / 1000);
  }

  /**
   * Launch Microsoft Store In-App Purchase Flow
   */
  async launchStorePurchase() {
    const isWindowsStore = Boolean(process.windowsStore);
    const storeId = PRO_ADDON_STORE_ID;

    // Microsoft Store URI protocols:
    // ms-windows-store://pdp/?ProductId=... (Product Detail Page)
    // Fallback: Web Store link
    const storeUri = `ms-windows-store://pdp/?ProductId=${storeId}`;
    const webFallbackUrl = `https://apps.microsoft.com/detail/${DEFAULT_STORE_PRODUCT_ID}`;

    try {
      const shellObj = electronModule && electronModule.shell ? electronModule.shell : null;
      if (shellObj) {
        if (process.platform === 'win32') {
          await shellObj.openExternal(storeUri).catch(() => {
            shellObj.openExternal(webFallbackUrl);
          });
        } else {
          await shellObj.openExternal(webFallbackUrl);
        }
      }
      return { success: true, opened: true };
    } catch (err) {
      console.warn('[LicenseManager] Error opening Store link:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Public status payload sent to UI
   */
  getPublicStatus() {
    const trialSeconds = this.getTrialRemainingSeconds();
    return {
      isPro: this.state.isPro,
      tier: this.state.tier,
      source: this.state.source,
      activatedAt: this.state.activatedAt,
      isStoreApp: Boolean(process.windowsStore),
      companionAuthorized: this.isCompanionApiAuthorized(),
      trialActive: trialSeconds > 0,
      trialRemainingSeconds: trialSeconds,
      storeProductId: DEFAULT_STORE_PRODUCT_ID,
      addonProductId: PRO_ADDON_STORE_ID
    };
  }

  /**
   * Subscribe to license state updates
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emitChange() {
    const status = this.getPublicStatus();
    for (const callback of this.listeners) {
      try { callback(status); } catch (e) {}
    }
  }
}

const instance = new LicenseManager();
module.exports = instance;
module.exports.LicenseManager = LicenseManager;
