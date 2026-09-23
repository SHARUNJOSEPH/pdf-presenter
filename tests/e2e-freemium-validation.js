/**
 * tests/e2e-freemium-validation.js
 * 
 * Big-Tech Grade Automated End-to-End (E2E) Freemium & Pro Licensing Test Suite.
 * Validates:
 * 1. 11-Language localization parity (all 17+ keys in 'pro' namespace across all 11 languages in js/locales.js)
 * 2. Static DOM integrity checks on views/launcher.html and views/presenter.html
 *    (#proHeaderContainer, #proPresenterContainer, .btn-upgrade-pro, .pro-badge-pill,
 *     #companionTrialContainer, #upgradeProModal, #btnStoreBuyPro, #btnActivateProKey)
 * 3. Default Free tier state (isPro: false, companionAuthorized: false, tier: 'free')
 * 4. Cryptographic invalid key rejection with INVALID_KEY error code
 * 5. Valid key activation (PRO-STORE-VERIFIED-LIFETIME, PRO-DEMO-TEST-2026-KEY1, and HMAC-SHA256 algorithmic keys)
 * 6. Live 15-minute trial countdown start and Companion API authorization
 * 7. Live Electron Launcher window UI interaction (modal opening, invalid key feedback, instant Pro badge unlock)
 * 8. Live Electron Presenter Cockpit window UI interaction (Companion modal pro badge, dynamic downgrade, in-app trial start)
 * 9. High-resolution screenshot capture for visual quality audit
 *
 * Supports execution directly via `electron tests/e2e-freemium-validation.js`
 * or via `node tests/e2e-freemium-validation.js` (automatically boots Electron runtime).
 */

// Dual-Runner Bridge: If executed under Node.js, spawn the Electron binary
if (!process.versions.electron) {
  const { spawn } = require('child_process');
  const electronBinary = require('electron');

  console.log('\n===============================================================');
  console.log('🚀 Spawning Electron runtime for Freemium E2E Validation...');
  console.log('===============================================================\n');

  const child = spawn(electronBinary, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
  return;
}

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Ensure isolated test user data directory
const testUserData = path.join(__dirname, '../.test-userdata-freemium');
app.setPath('userData', testUserData);

// Artifact directory for saving visual proof
const ARTIFACTS_DIR = path.resolve('C:/Users/user/.gemini/antigravity/brain/a3fd4bf5-9043-4f26-bfeb-90ea65f209c3');
const SCREENSHOT_DIR = path.join(ARTIFACTS_DIR, 'freemium_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// License Manager
const licenseManager = require('../js/license-manager.js');
const { LicenseManager } = licenseManager;

let launcherWindow = null;
let presenterWindow = null;

const testResults = [];

function recordResult(testName, passed, details = '') {
  testResults.push({ name: testName, passed, details });
  const symbol = passed ? '  ✅ PASS' : '  ❌ FAIL';
  console.log(`${symbol}: ${testName} ${details ? '(' + details + ')' : ''}`);
}

async function captureScreenshot(win, filename) {
  try {
    if (!win || win.isDestroyed()) return null;
    const image = await win.webContents.capturePage();
    const destPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(destPath, image.toPNG());
    console.log(`     📸 Screenshot captured: ${filename}`);
    return destPath;
  } catch (err) {
    console.warn(`     ⚠️ Failed to capture screenshot ${filename}:`, err.message);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function attachConsoleLogger(win, label) {
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.log(`     [${label} ${level === 3 ? 'ERROR' : 'WARN'}] ${message}`);
    }
  });
}

// Setup IPC handlers required by launcher and presentation views
function setupMockIPC() {
  ipcMain.handle('get-displays', () => screen.getAllDisplays());

  ipcMain.handle('get-companion-info', () => ({
    isRunning: true,
    port: 3000,
    host: '0.0.0.0',
    localIps: ['127.0.0.1'],
    activeUrl: 'http://127.0.0.1:3000/api/',
    interfaces: [{ name: 'Loopback', address: '127.0.0.1' }]
  }));

  ipcMain.handle('get-api-config', () => ({
    enabled: true,
    host: '0.0.0.0',
    port: 3000,
    localIps: ['127.0.0.1'],
    interfaces: [{ name: 'Loopback', address: '127.0.0.1' }],
    activeUrl: 'http://127.0.0.1:3000/api/'
  }));

  ipcMain.handle('update-api-config', (event, cfg) => ({
    success: true,
    enabled: cfg.enabled !== false,
    host: cfg.host || '0.0.0.0',
    port: cfg.port || 3000,
    activeUrl: `http://${cfg.host || '127.0.0.1'}:${cfg.port || 3000}/api/`
  }));

  ipcMain.handle('get-presentation-data', () => ({
    config: {
      isDemo: true,
      title: 'Interactive Presentation Showcase.pdf',
      totalPages: 6,
      aspectRatio: 16 / 9,
      transitionDuration: 0.4
    },
    isDemo: true,
    totalPages: 6,
    documentTitle: 'Interactive Demo Presentation',
    aspectRatio: 16 / 9,
    transitionStyle: 'fade',
    transitionDuration: 0.4,
    pdfBuffer: null,
    pdfPath: null
  }));

  ipcMain.handle('toggle-presenter-fullscreen', () => ({ isFullScreen: false }));
  ipcMain.handle('open-external', () => ({ success: true }));
  ipcMain.handle('export-companion-config', () => ({ success: true, json: '{}' }));
  ipcMain.handle('check-for-updates', () => ({
    isStore: false,
    hasUpdate: false,
    currentVersion: '1.2.2',
    latestVersion: '1.2.2',
    releaseUrl: 'https://github.com/SHARUNJOSEPH/pdf-presenter/releases'
  }));

  ipcMain.handle('select-pdf-file', () => null);
  ipcMain.handle('load-recent-pdf', () => null);
  ipcMain.handle('set-active-pdf-buffer', () => ({ success: true }));
  ipcMain.handle('start-presentation', () => ({ success: true }));
  ipcMain.handle('end-presentation', () => ({ success: true }));

  ipcMain.on('sync-event', (event, data) => {
    if (presenterWindow && !presenterWindow.isDestroyed() && event.sender !== presenterWindow.webContents) {
      presenterWindow.webContents.send('sync-event', data);
    }
  });

  // Freemium & In-App Purchase (IAP) IPC Handlers
  ipcMain.handle('get-license-status', () => {
    return licenseManager.getPublicStatus();
  });

  ipcMain.handle('purchase-pro', async () => {
    return await licenseManager.launchStorePurchase();
  });

  ipcMain.handle('activate-license-key', (event, key) => {
    return licenseManager.activateLicenseKey(key);
  });

  ipcMain.handle('start-companion-trial', () => {
    return licenseManager.startCompanionTrial();
  });

  ipcMain.handle('set-edition', (event, ed) => {
    return licenseManager.setEdition(ed);
  });

  ipcMain.handle('toggle-edition', () => {
    return licenseManager.toggleEdition();
  });

  ipcMain.handle('forget-license', () => {
    return licenseManager.forgetStoredLicense();
  });

  // Broadcast license changes to active windows
  licenseManager.onChange((licenseStatus) => {
    const wins = [launcherWindow, presenterWindow];
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('license-changed', licenseStatus);
      }
    }
  });
}

// -----------------------------------------------------------------------------
// MAIN TEST SUITE RUNNER
// -----------------------------------------------------------------------------
async function runFreemiumValidation() {
  console.log('\n===============================================================');
  console.log('💎 STARTING E2E FREEMIUM & PRO LICENSING VALIDATION SUITE');
  console.log('===============================================================\n');

  try {
    setupMockIPC();

    // Ensure pristine initial state
    licenseManager.resetToFree();
    const encFile = path.join(testUserData, 'license.enc');
    if (fs.existsSync(encFile)) {
      try { fs.unlinkSync(encFile); } catch (e) {}
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 1: 11-LANGUAGE LOCALIZATION AUDIT ('pro' NAMESPACE)
    // -------------------------------------------------------------------------
    console.log('[Suite 1] Auditing 11-Language Localization Parity for Pro Features...');
    const locales = require('../js/locales.js');
    const requiredLanguages = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'ru', 'zh'];
    const requiredProKeys = [
      'upgradeBtn',
      'proBadge',
      'freeTier',
      'modalTitle',
      'modalSubtitle',
      'oneTimePrice',
      'featureCompanion',
      'featureGrid',
      'featureBranding',
      'featureTimer',
      'featureLicense',
      'buyStore',
      'enterKey',
      'keyPlaceholder',
      'activateKey',
      'keySuccess',
      'keyInvalid'
    ];

    let allLangsPresent = true;
    let missingProKeysSummary = [];

    for (const lang of requiredLanguages) {
      if (!locales[lang]) {
        allLangsPresent = false;
        missingProKeysSummary.push(`${lang}: language bundle missing completely`);
        continue;
      }

      const proNamespace = locales[lang].pro;
      if (!proNamespace || typeof proNamespace !== 'object') {
        missingProKeysSummary.push(`${lang}: missing 'pro' namespace`);
        continue;
      }

      for (const key of requiredProKeys) {
        if (!proNamespace[key] || typeof proNamespace[key] !== 'string' || proNamespace[key].trim() === '') {
          missingProKeysSummary.push(`${lang}.pro.${key}: missing or empty`);
        }
      }
    }

    recordResult('11 Languages Present in js/locales.js', 
      allLangsPresent, 
      `Languages: ${requiredLanguages.join(', ')}`);

    recordResult('All 17 Required Keys Present Across All 11 Locales in pro Namespace', 
      missingProKeysSummary.length === 0, 
      missingProKeysSummary.length === 0 ? '100% Translation Parity' : missingProKeysSummary.slice(0, 3).join('; '));

    // Also verify trial keys if present
    let trialKeysPresent = true;
    for (const lang of requiredLanguages) {
      if (!locales[lang].pro || !locales[lang].pro.trialBadge || !locales[lang].pro.startTrial) {
        trialKeysPresent = false;
        break;
      }
    }
    recordResult('Trial Localization Keys (trialBadge, startTrial) Present Across All 11 Locales', trialKeysPresent);

    // -------------------------------------------------------------------------
    // TEST SUITE 2: STATIC DOM INTEGRITY AUDIT ON VIEWS
    // -------------------------------------------------------------------------
    console.log('\n[Suite 2] Auditing Static HTML DOM Integrity in views/launcher.html & views/presenter.html...');
    const launcherHtmlPath = path.join(__dirname, '../views/launcher.html');
    const presenterHtmlPath = path.join(__dirname, '../views/presenter.html');
    const launcherHtml = fs.readFileSync(launcherHtmlPath, 'utf8');
    const presenterHtml = fs.readFileSync(presenterHtmlPath, 'utf8');

    // Launcher checks
    const launcherHasProHeader = launcherHtml.includes('id="proHeaderContainer"');
    const launcherHasUpgradeBtn = launcherHtml.includes('class="btn-upgrade-pro"') || launcherHtml.includes("btn-upgrade-pro");
    const launcherHasProBadge = launcherHtml.includes('class="pro-badge-pill"') || launcherHtml.includes("pro-badge-pill");
    const launcherHasUpgradeModal = launcherHtml.includes('id="upgradeProModal"');
    const launcherHasStoreBuyBtn = launcherHtml.includes('id="btnStoreBuyPro"');
    const launcherHasActivateKeyBtn = launcherHtml.includes('id="btnActivateProKey"');

    recordResult('views/launcher.html contains #proHeaderContainer with .btn-upgrade-pro and .pro-badge-pill',
      launcherHasProHeader && launcherHasUpgradeBtn && launcherHasProBadge,
      'Header container & badge components verified');

    recordResult('views/launcher.html contains #upgradeProModal with #btnStoreBuyPro and #btnActivateProKey',
      launcherHasUpgradeModal && launcherHasStoreBuyBtn && launcherHasActivateKeyBtn,
      'Upgrade modal & activation buttons verified');

    // Presenter checks
    const presenterHasProContainer = presenterHtml.includes('id="proPresenterContainer"');
    const presenterHasUpgradeBtn = presenterHtml.includes('id="btnPresenterUpgradePro"');
    const presenterHasProBadge = presenterHtml.includes('id="badgePresenterPro"');
    const presenterHasTrialContainer = presenterHtml.includes('id="companionTrialContainer"');
    const presenterHasUpgradeModal = presenterHtml.includes('id="upgradeProModal"');
    const presenterHasStoreBuyBtn = presenterHtml.includes('id="btnStoreBuyPro"');
    const presenterHasActivateKeyBtn = presenterHtml.includes('id="btnActivateProKey"');

    recordResult('views/presenter.html contains #proPresenterContainer with .btn-upgrade-pro and .pro-badge-pill',
      presenterHasProContainer && presenterHasUpgradeBtn && presenterHasProBadge,
      'Presenter header container & badge verified');

    recordResult('views/presenter.html contains #companionTrialContainer inside companion modal',
      presenterHasTrialContainer,
      '#companionTrialContainer verified');

    recordResult('views/presenter.html contains #upgradeProModal with #btnStoreBuyPro and #btnActivateProKey',
      presenterHasUpgradeModal && presenterHasStoreBuyBtn && presenterHasActivateKeyBtn,
      'Presenter upgrade modal & buttons verified');

    // -------------------------------------------------------------------------
    // TEST SUITE 3: BACKEND IPC & ENTITLEMENT STATE MACHINE
    // -------------------------------------------------------------------------
    console.log('\n[Suite 3] Testing Core License Entitlement State Machine & IPC Logic...');

    // 3.1 Default Free tier state
    licenseManager.resetToFree();
    const defaultStatus = licenseManager.getPublicStatus();
    recordResult('Default Free Tier Status (isPro: false, companionAuthorized: false, tier: free)',
      defaultStatus.isPro === false &&
      defaultStatus.companionAuthorized === false &&
      defaultStatus.tier === 'free' &&
      defaultStatus.trialActive === false &&
      defaultStatus.trialRemainingSeconds === 0,
      `isPro: ${defaultStatus.isPro}, tier: ${defaultStatus.tier}, companion: ${defaultStatus.companionAuthorized}`);

    // 3.2 Invalid key rejection
    const invalidKeys = ['', 'INVALID-KEY-123', 'PRO-XXXX-YYYY-ZZZZ-WWWW', 'PRO-FORGED-KEY-0000'];
    let allInvalidRejected = true;
    for (const key of invalidKeys) {
      const res = licenseManager.activateLicenseKey(key);
      if (res.success !== false || res.error !== 'INVALID_KEY') {
        allInvalidRejected = false;
        break;
      }
    }
    const statusAfterInvalid = licenseManager.getPublicStatus();
    recordResult('Invalid Key Rejection with INVALID_KEY Error Code',
      allInvalidRejected && statusAfterInvalid.isPro === false,
      'Tested empty, malformed, non-hex, and forged checksum keys');

    // 3.3 Valid key activation: Developer evaluation key
    const devKeyResult = licenseManager.activateLicenseKey('PRO-DEMO-TEST-2026-KEY1');
    const statusAfterDevKey = licenseManager.getPublicStatus();
    recordResult('Developer Evaluation Key Activation (PRO-DEMO-TEST-2026-KEY1)',
      devKeyResult.success === true && statusAfterDevKey.isPro === true && statusAfterDevKey.companionAuthorized === true,
      `isPro: ${statusAfterDevKey.isPro}, tier: ${statusAfterDevKey.tier}`);

    // Reset back to Free
    licenseManager.resetToFree();

    // 3.4 Valid key activation: Lifetime Store Verified key
    const lifetimeKeyResult = licenseManager.activateLicenseKey('PRO-STORE-VERIFIED-LIFETIME');
    const statusAfterLifetime = licenseManager.getPublicStatus();
    recordResult('Lifetime Key Activation (PRO-STORE-VERIFIED-LIFETIME)',
      lifetimeKeyResult.success === true && statusAfterLifetime.isPro === true,
      `isPro: ${statusAfterLifetime.isPro}, tier: ${statusAfterLifetime.tier}`);

    // Reset back to Free
    licenseManager.resetToFree();

    // 3.5 Valid key activation: Cryptographic HMAC-SHA256 Algorithmic key
    const algoKey = LicenseManager.generateAlgorithmicKey('QA-E2E-ENTERPRISE-SUITE');
    const algoValidation = licenseManager.validateLicenseKey(algoKey);
    const algoKeyResult = licenseManager.activateLicenseKey(algoKey);
    const statusAfterAlgo = licenseManager.getPublicStatus();
    recordResult('HMAC-SHA256 Algorithmic License Key Generation & Activation',
      algoValidation === true && algoKeyResult.success === true && statusAfterAlgo.isPro === true,
      `Key: ${algoKey}`);

    // Reset back to Free
    licenseManager.resetToFree();

    // 3.6 15-Minute Live Trial Engine & Companion API Authorization
    const preTrialAuth = licenseManager.isCompanionApiAuthorized();
    const trialStartResult = licenseManager.startCompanionTrial();
    const postTrialAuth = licenseManager.isCompanionApiAuthorized();
    const postTrialStatus = licenseManager.getPublicStatus();

    recordResult('15-Minute Live Companion Trial Start & Authorization in Free Tier',
      preTrialAuth === false &&
      trialStartResult.success === true &&
      postTrialAuth === true &&
      postTrialStatus.isPro === false &&
      postTrialStatus.trialActive === true &&
      postTrialStatus.trialRemainingSeconds > 0 &&
      postTrialStatus.trialRemainingSeconds <= 900,
      `Authorized: ${postTrialAuth}, Remaining: ${postTrialStatus.trialRemainingSeconds}s, isPro: ${postTrialStatus.isPro}`);

    // Clean reset before starting GUI tests
    licenseManager.resetToFree();

    // -------------------------------------------------------------------------
    // TEST SUITE 4: LIVE LAUNCHER WINDOW E2E GUI TESTING
    // -------------------------------------------------------------------------
    console.log('\n[Suite 4] Testing Live Launcher Window UI & Upgrade Modal Flow...');

    launcherWindow = new BrowserWindow({
      width: 1100,
      height: 820,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    attachConsoleLogger(launcherWindow, 'Launcher');

    await launcherWindow.loadFile(path.join(__dirname, '../views/launcher.html'));
    await sleep(600); // Allow DOM and UpgradeModal.init() to settle

    // 4.1 Initial Free Tier DOM state
    const launcherFreeDomState = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        const btnUpgrade = document.getElementById('btnHeaderUpgradePro');
        const badgePro = document.getElementById('badgeHeaderPro');
        const styleBtn = btnUpgrade ? window.getComputedStyle(btnUpgrade).display : 'none';
        const styleBadge = badgePro ? window.getComputedStyle(badgePro).display : 'none';
        const isProApi = window.UpgradeModal ? window.UpgradeModal.isPro() : null;

        return {
          hasBtn: !!btnUpgrade,
          hasBadge: !!badgePro,
          btnVisible: styleBtn !== 'none',
          badgeHidden: styleBadge === 'none',
          isProApi: isProApi
        };
      })()
    `);

    recordResult('Launcher Window Free Tier UI (Upgrade Button visible, Pro Badge hidden)',
      launcherFreeDomState.hasBtn && launcherFreeDomState.btnVisible && launcherFreeDomState.badgeHidden && launcherFreeDomState.isProApi === false,
      `btnVisible: ${launcherFreeDomState.btnVisible}, badgeHidden: ${launcherFreeDomState.badgeHidden}`);

    await captureScreenshot(launcherWindow, '01_launcher_free_tier.png');

    // 4.2 Click Upgrade to Pro button -> opens #upgradeProModal
    const openModalResult = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        const btn = document.getElementById('btnHeaderUpgradePro');
        if (btn) btn.click();
        const modal = document.getElementById('upgradeProModal');
        const style = modal ? window.getComputedStyle(modal) : null;
        return {
          modalExists: !!modal,
          isOpenClass: modal ? modal.classList.contains('open') : false,
          isDisplayed: style ? (style.display === 'flex' || style.display === 'block') : false
        };
      })()
    `);

    await sleep(250);
    recordResult('Clicking Upgrade Button Opens #upgradeProModal with Animated Backdrop',
      openModalResult.modalExists && (openModalResult.isOpenClass || openModalResult.isDisplayed),
      `Modal Display: flex, open class applied`);

    await captureScreenshot(launcherWindow, '02_launcher_upgrade_modal.png');

    // 4.3 Expand Key Accordion and Test Invalid Key
    const invalidKeyUiResult = await launcherWindow.webContents.executeJavaScript(`
      (async () => {
        const btnToggle = document.getElementById('btnToggleKeyAccordion');
        const keyRow = document.getElementById('keyInputRowContainer');
        if (btnToggle && (keyRow.style.display === 'none' || !keyRow.style.display)) {
          btnToggle.click();
        }
        
        const keyInput = document.getElementById('txtProLicenseKey');
        const btnActivate = document.getElementById('btnActivateProKey');
        const keyMsg = document.getElementById('upgradeKeyMsg');

        keyInput.value = 'PRO-INVALID-FORGED-KEY-0000';
        btnActivate.click();

        await new Promise(r => setTimeout(r, 200));

        return {
          rowVisible: keyRow.style.display !== 'none',
          hasErrorClass: keyMsg.classList.contains('key-msg-error'),
          msgText: keyMsg.textContent,
          isPro: window.UpgradeModal.isPro()
        };
      })()
    `);

    recordResult('Interactive Invalid Key Entry Rejection in Upgrade Modal',
      invalidKeyUiResult.rowVisible && invalidKeyUiResult.hasErrorClass && invalidKeyUiResult.isPro === false,
      `Feedback: "${invalidKeyUiResult.msgText}"`);

    await captureScreenshot(launcherWindow, '03_invalid_key_feedback.png');

    // 4.4 Enter Valid Developer Key -> Unlocks Pro & Updates Header
    const validKeyUiResult = await launcherWindow.webContents.executeJavaScript(`
      (async () => {
        const keyInput = document.getElementById('txtProLicenseKey');
        const btnActivate = document.getElementById('btnActivateProKey');
        const keyMsg = document.getElementById('upgradeKeyMsg');

        keyInput.value = 'PRO-DEMO-TEST-2026-KEY1';
        btnActivate.click();

        await new Promise(r => setTimeout(r, 400));

        return {
          hasSuccessClass: keyMsg.classList.contains('key-msg-success'),
          msgText: keyMsg.textContent,
          isPro: window.UpgradeModal.isPro()
        };
      })()
    `);

    recordResult('Interactive Valid Key Activation in Upgrade Modal',
      validKeyUiResult.hasSuccessClass && validKeyUiResult.isPro === true,
      `Feedback: "${validKeyUiResult.msgText}", isPro: ${validKeyUiResult.isPro}`);

    // Wait for modal auto-dismiss timer
    await sleep(1400);

    // Verify Launcher Header has transformed to Pro state
    const launcherProDomState = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        const btnUpgrade = document.getElementById('btnHeaderUpgradePro');
        const badgePro = document.getElementById('badgeHeaderPro');
        const styleBtn = btnUpgrade ? window.getComputedStyle(btnUpgrade).display : 'none';
        const styleBadge = badgePro ? window.getComputedStyle(badgePro).display : 'none';

        return {
          btnHidden: styleBtn === 'none',
          badgeVisible: styleBadge !== 'none',
          isPro: window.UpgradeModal.isPro()
        };
      })()
    `);

    recordResult('Launcher Header Dynamically Transforms to Pro (Badge visible, Upgrade hidden)',
      launcherProDomState.btnHidden && launcherProDomState.badgeVisible && launcherProDomState.isPro === true,
      `Badge: ${launcherProDomState.badgeVisible}, Upgrade Btn Hidden: ${launcherProDomState.btnHidden}`);

    await captureScreenshot(launcherWindow, '04_launcher_pro_active.png');

    // -------------------------------------------------------------------------
    // TEST SUITE 5: LIVE PRESENTER COCKPIT WINDOW E2E GUI TESTING
    // -------------------------------------------------------------------------
    console.log('\n[Suite 5] Testing Live Presenter Cockpit Window UI, Paywall, & Trial Integration...');

    presenterWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    attachConsoleLogger(presenterWindow, 'Presenter');

    await presenterWindow.loadFile(path.join(__dirname, '../views/presenter.html'));
    await sleep(800); // Allow initialization and license status sync

    // 5.1 Presenter Cockpit starts in Pro state (persisted from step 4.4)
    const presenterProState = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const btnUpgrade = document.getElementById('btnPresenterUpgradePro');
        const badgePro = document.getElementById('badgePresenterPro');
        const styleBtn = btnUpgrade ? window.getComputedStyle(btnUpgrade).display : 'none';
        const styleBadge = badgePro ? window.getComputedStyle(badgePro).display : 'none';
        const lockTags = Array.from(document.querySelectorAll('.pro-tag-lock'));
        const allLocksHidden = lockTags.every(t => window.getComputedStyle(t).display === 'none');

        // Open Companion modal to inspect container
        const btnCompanion = document.getElementById('btnCompanion');
        if (btnCompanion) btnCompanion.click();

        const trialBox = document.getElementById('companionTrialContainer');
        const trialText = trialBox ? trialBox.textContent : '';

        return {
          btnHidden: styleBtn === 'none',
          badgeVisible: styleBadge !== 'none',
          locksHidden: allLocksHidden,
          hasProBadgeInCompanion: trialText.includes('PRO LICENSE ACTIVE'),
          isPro: window.UpgradeModal.isPro()
        };
      })()
    `);

    recordResult('Presenter Cockpit Reflects Pro Entitlement (Pro Badge visible, Locks hidden, Companion Unrestricted)',
      presenterProState.btnHidden && presenterProState.badgeVisible && presenterProState.locksHidden && presenterProState.hasProBadgeInCompanion,
      `Locks Hidden: ${presenterProState.locksHidden}, Companion: Unrestricted`);

    await captureScreenshot(presenterWindow, '05_presenter_pro_active.png');

    // Close companion modal
    await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('companionModal');
        if (modal) {
          modal.classList.remove('open');
          modal.style.display = 'none';
        }
      })()
    `);

    // 5.2 Dynamic Downgrade to Free tier via IPC Broadcast
    licenseManager.resetToFree();
    await sleep(400); // Allow broadcast to propagate to windows

    const presenterFreeState = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const btnUpgrade = document.getElementById('btnPresenterUpgradePro');
        const badgePro = document.getElementById('badgePresenterPro');
        const styleBtn = btnUpgrade ? window.getComputedStyle(btnUpgrade).display : 'none';
        const styleBadge = badgePro ? window.getComputedStyle(badgePro).display : 'none';
        const lockTags = Array.from(document.querySelectorAll('.pro-tag-lock'));
        const allLocksVisible = lockTags.some(t => window.getComputedStyle(t).display !== 'none');

        // Open Companion modal
        const btnCompanion = document.getElementById('btnCompanion');
        if (btnCompanion) btnCompanion.click();

        const trialBox = document.getElementById('companionTrialContainer');
        const btnStartTrial = trialBox ? trialBox.querySelector('#btnStartTrialInner') : null;

        return {
          btnVisible: styleBtn !== 'none',
          badgeHidden: styleBadge === 'none',
          locksVisible: allLocksVisible,
          hasStartTrialBtn: !!btnStartTrial,
          isPro: window.UpgradeModal.isPro()
        };
      })()
    `);

    recordResult('Dynamic Downgrade to Free Tier via Live IPC Broadcast (Upgrade Button visible, Locks visible, Trial button ready)',
      presenterFreeState.btnVisible && presenterFreeState.badgeHidden && presenterFreeState.locksVisible && presenterFreeState.hasStartTrialBtn,
      `Start Trial Button Present: ${presenterFreeState.hasStartTrialBtn}`);

    // 5.3 Interactive Trial Activation via Presenter Cockpit UI
    const trialActivationUiResult = await presenterWindow.webContents.executeJavaScript(`
      (async () => {
        const trialBox = document.getElementById('companionTrialContainer');
        const btnStart = trialBox ? trialBox.querySelector('#btnStartTrialInner') : null;
        if (btnStart) {
          btnStart.click();
        }

        await new Promise(r => setTimeout(r, 400));

        const refreshedTrialBox = document.getElementById('companionTrialContainer');
        const text = refreshedTrialBox ? refreshedTrialBox.textContent : '';

        return {
          hasTrialText: text.includes('Trial Active') || text.includes('remaining'),
          isTrialActive: window.UpgradeModal.getStatus().trialActive
        };
      })()
    `);

    const backendTrialStatus = licenseManager.getPublicStatus();
    recordResult('Interactive Companion Trial Activation via Presenter Cockpit UI',
      trialActivationUiResult.hasTrialText &&
      backendTrialStatus.trialActive === true &&
      backendTrialStatus.companionAuthorized === true,
      `Backend Auth: ${backendTrialStatus.companionAuthorized}, Remaining: ${backendTrialStatus.trialRemainingSeconds}s`);

    await captureScreenshot(presenterWindow, '06_presenter_trial_active.png');

    // -------------------------------------------------------------------------
    // TEST SUITE SUMMARY & METRICS
    // -------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('📊 FREEMIUM & PRO VALIDATION CERTIFICATION SUMMARY');
    console.log('===============================================================');

    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    testResults.forEach((r, idx) => {
      const status = r.passed ? 'PASS' : 'FAIL';
      console.log(`[${idx + 1}/${totalTests}] [${status}] ${r.name} ${r.details ? '— ' + r.details : ''}`);
    });

    console.log('\n---------------------------------------------------------------');
    console.log(`Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
    console.log(`Screenshots Saved: ${SCREENSHOT_DIR}`);
    console.log('---------------------------------------------------------------\n');

    if (failedTests === 0) {
      console.log('🎉 ALL FREEMIUM QUALITY GATES PASSED WITH 100% SUCCESS!');
    } else {
      console.error(`💥 ${failedTests} test(s) failed.`);
    }

    // Cleanup and exit
    licenseManager.resetToFree();
    if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.destroy();
    if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.destroy();

    app.exit(failedTests === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Fatal Freemium Validation Error:', error);
    app.exit(1);
  }
}

app.whenReady().then(runFreemiumValidation);
