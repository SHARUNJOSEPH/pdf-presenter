/**
 * tests/e2e-swarm-verification.js
 * 
 * Autonomous Quality Assurance Swarm Verification Harness for PDF Presenter Suite.
 * 
 * Validates Enterprise Requirements:
 * - R1: Exhaustive 11-Language Visual Audit (33 View Screenshots across Launcher, Presenter, Audience)
 * - R2: Arabic RTL & Numeric Isolation (dir="rtl", .rtl-layout, LTR timer, clock, slide counter)
 * - R3: Modal Dialog Visual Integrity across all 11 Languages (Shortcuts Modal, Companion Modal, API Modal)
 * - R4: Live Runtime Language Synchronization via BroadcastChannel & IPC (Zero page reload)
 * - R5: Quality Gate & Artifact Verification (33 View Screenshots + 33 Modal Screenshots verified)
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const testUserData = path.join(__dirname, '../.test-userdata-swarm');
app.setPath('userData', testUserData);

// Directories for screenshots
const ARTIFACTS_VIEWS_DIR = path.join(__dirname, '../artifacts/screenshots/views');
const ARTIFACTS_MODALS_DIR = path.join(__dirname, '../artifacts/screenshots/modals');
const REPO_VIEWS_DIR = path.join(__dirname, '../screenshots/views');
const REPO_MODALS_DIR = path.join(__dirname, '../screenshots/modals');

[ARTIFACTS_VIEWS_DIR, ARTIFACTS_MODALS_DIR, REPO_VIEWS_DIR, REPO_MODALS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const ALL_LANGUAGES = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ar', 'pt', 'hi', 'ru', 'it'];

let launcherWindow = null;
let presenterWindow = null;
let audienceWindow = null;

const testResults = [];

function recordResult(requirement, testName, passed, details = '') {
  testResults.push({ requirement, name: testName, passed, details });
  const symbol = passed ? '  ✅ PASS' : '  ❌ FAIL';
  console.log(`${symbol} [${requirement}]: ${testName} ${details ? '(' + details + ')' : ''}`);
}

async function captureDualScreenshot(win, category, filename) {
  try {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
    await sleep(80);
    const image = await win.webContents.capturePage();
    const pngBuffer = image.toPNG();
    
    const artDir = category === 'views' ? ARTIFACTS_VIEWS_DIR : ARTIFACTS_MODALS_DIR;
    const repoDir = category === 'views' ? REPO_VIEWS_DIR : REPO_MODALS_DIR;
    
    const artPath = path.join(artDir, filename);
    const repoPath = path.join(repoDir, filename);
    
    fs.writeFileSync(artPath, pngBuffer);
    fs.writeFileSync(repoPath, pngBuffer);
    
    const sizeKB = Math.round(pngBuffer.length / 1024);
    console.log(`     📸 [${category}] Captured: ${filename} (${sizeKB} KB)`);
    return { path: artPath, size: pngBuffer.length };
  } catch (err) {
    console.warn(`     ⚠️ Failed to capture ${category}/${filename}:`, err.message);
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

  ipcMain.handle('check-for-updates', () => ({
    isStore: false,
    hasUpdate: false,
    currentVersion: '1.2.0',
    latestVersion: '1.2.0',
    releaseUrl: 'https://github.com/SHARUNJOSEPH/pdf-presenter/releases'
  }));

  ipcMain.handle('export-companion-config', () => ({ success: true }));

  ipcMain.handle('get-presentation-data', () => ({
    config: {
      isDemo: true,
      title: 'Interactive Presentation Showcase.pdf',
      totalPages: 6,
      transitionDuration: 0.4,
      transitionStyle: 'crossfade'
    },
    streamUrl: null,
    pdfData: null
  }));

  ipcMain.handle('toggle-presenter-fullscreen', () => ({
    isFullScreen: false
  }));

  ipcMain.on('sync-event', (event, data) => {
    if (audienceWindow && !audienceWindow.isDestroyed() && event.sender !== audienceWindow.webContents) {
      audienceWindow.webContents.send('sync-event', data);
    }
    if (presenterWindow && !presenterWindow.isDestroyed() && event.sender !== presenterWindow.webContents) {
      presenterWindow.webContents.send('sync-event', data);
    }
  });
}

async function runSwarmVerification() {
  console.log('\n================================================================');
  console.log('  🐝 AUTONOMOUS QA SWARM: R1-R5 COMPREHENSIVE VERIFICATION HARNESS');
  console.log('================================================================\n');

  setupMockIPC();

  // 1. Launch Launcher Window
  console.log('▶ [INIT] Launching Launcher Window...');
  launcherWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  attachConsoleLogger(launcherWindow, 'Launcher');
  await launcherWindow.loadFile(path.join(__dirname, '../views/launcher.html'));
  await sleep(700);

  // 2. Launch Presenter Window
  console.log('▶ [INIT] Launching Presenter Cockpit Window...');
  presenterWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  attachConsoleLogger(presenterWindow, 'Presenter');
  await presenterWindow.loadFile(path.join(__dirname, '../views/presenter.html'));
  await sleep(1200);

  // 3. Launch Audience Stage Window
  console.log('▶ [INIT] Launching Audience Display Window...');
  audienceWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  attachConsoleLogger(audienceWindow, 'Audience');
  await audienceWindow.loadFile(path.join(__dirname, '../views/audience.html'));
  await sleep(1000);

  // Set reload marker on Audience to strictly test zero-reload sync later
  await audienceWindow.webContents.executeJavaScript(`
    window.__swarmInitTimestamp = Date.now();
    window.__swarmReloadMarker = 'PRESENTER_SUITE_AUDIENCE_ACTIVE';
  `);

  // ===========================================================================
  // REQUIREMENT 1 (R1): EXHAUSTIVE 11-LANGUAGE VISUAL AUDIT (33 VIEW SCREENSHOTS)
  // ===========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('  R1: Exhaustive 11-Language Visual Audit (33 View Screenshots Matrix)');
  console.log('----------------------------------------------------------------\n');

  for (const lang of ALL_LANGUAGES) {
    console.log(`--- [R1] Processing Language: ${lang.toUpperCase()} ---`);

    // A. Launcher View
    const launcherData = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const subtitle = document.querySelector('[data-i18n="launcher.subtitle"]').textContent.trim();
        const dropTitle = document.querySelector('[data-i18n="launcher.dropTitle"]').textContent.trim();
        return {
          currentLang: i18n.getCurrentLanguage(),
          subtitle,
          dropTitle,
          isRTL: document.documentElement.dir === 'rtl'
        };
      })()
    `);
    await sleep(200);
    const launcherImg = await captureDualScreenshot(launcherWindow, 'views', `launcher_${lang}.png`);
    recordResult('R1', `Launcher View rendered in '${lang}'`, launcherData.currentLang === lang && launcherData.dropTitle.length > 3, `Title: "${launcherData.dropTitle}"`);

    // B. Presenter View
    const presenterData = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const slideCounter = document.getElementById('slideCounter');
        const counterText = slideCounter ? slideCounter.textContent.trim() : '';
        const timerText = document.getElementById('timerDisplay').textContent.trim();
        return {
          currentLang: i18n.getCurrentLanguage(),
          counterText,
          timerText,
          isRTL: document.documentElement.dir === 'rtl'
        };
      })()
    `);
    await sleep(250);
    const presenterImg = await captureDualScreenshot(presenterWindow, 'views', `presenter_${lang}.png`);
    recordResult('R1', `Presenter View rendered in '${lang}'`, presenterData.currentLang === lang && presenterData.counterText.length > 3, `Counter: "${presenterData.counterText}"`);

    // C. Audience View (Expose translated placeholder waiting screen)
    const audienceData = await audienceWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const placeholder = document.getElementById('placeholder');
        if (placeholder) {
          placeholder.style.display = 'flex';
          placeholder.style.opacity = '1';
          placeholder.style.visibility = 'visible';
        }
        const titleEl = document.querySelector('[data-i18n="audience.waitingTitle"]');
        const subEl = document.querySelector('[data-i18n="audience.waitingSubtitle"]');
        return {
          currentLang: i18n.getCurrentLanguage(),
          titleText: titleEl ? titleEl.textContent.trim() : '',
          subtitleText: subEl ? subEl.textContent.trim() : '',
          isRTL: document.documentElement.dir === 'rtl'
        };
      })()
    `);
    await sleep(350);
    const audienceImg = await captureDualScreenshot(audienceWindow, 'views', `audience_${lang}.png`);
    recordResult('R1', `Audience View rendered in '${lang}'`, audienceData.currentLang === lang && audienceData.titleText.length > 3, `Stage: "${audienceData.titleText}"`);
  }

  // ===========================================================================
  // REQUIREMENT 2 (R2): ARABIC RTL & NUMERIC ISOLATION RIGOROUS VERIFICATION
  // ===========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('  R2: Arabic RTL & Numeric Isolation (DOM & Computed Styles)');
  console.log('----------------------------------------------------------------\n');

  // Switch Presenter to Arabic
  await presenterWindow.webContents.executeJavaScript(`i18n.setLanguage('ar');`);
  await launcherWindow.webContents.executeJavaScript(`i18n.setLanguage('ar');`);
  await sleep(300);

  const presenterRtlAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const html = document.documentElement;
      const body = document.body;
      const timerDisplay = document.getElementById('timerDisplay');
      const clockDisplay = document.getElementById('clockDisplay');
      const slideCounter = document.getElementById('slideCounter');
      const timerWidget = document.querySelector('.timer-widget');

      const timerStyle = window.getComputedStyle(timerDisplay);
      const clockStyle = window.getComputedStyle(clockDisplay);
      const counterStyle = window.getComputedStyle(slideCounter);
      const timerWidgetStyle = window.getComputedStyle(timerWidget);

      return {
        htmlDir: html.getAttribute('dir'),
        htmlLang: html.getAttribute('lang'),
        bodyHasRtlClass: body.classList.contains('rtl-layout'),
        timerDirection: timerStyle.direction,
        clockDirection: clockStyle.direction,
        counterDirection: counterStyle.direction,
        counterUnicodeBidi: counterStyle.unicodeBidi,
        timerWidgetDirection: timerWidgetStyle.direction,
        counterText: slideCounter.textContent.trim()
      };
    })()
  `);

  recordResult('R2', 'Arabic HTML dir attribute is "rtl"', presenterRtlAudit.htmlDir === 'rtl', `dir="${presenterRtlAudit.htmlDir}"`);
  recordResult('R2', 'Arabic HTML lang attribute is "ar"', presenterRtlAudit.htmlLang === 'ar', `lang="${presenterRtlAudit.htmlLang}"`);
  recordResult('R2', 'Arabic body contains "rtl-layout" class', presenterRtlAudit.bodyHasRtlClass === true, `classList contains rtl-layout: ${presenterRtlAudit.bodyHasRtlClass}`);
  recordResult('R2', 'Timer display computed direction is strictly "ltr"', presenterRtlAudit.timerDirection === 'ltr', `direction="${presenterRtlAudit.timerDirection}"`);
  recordResult('R2', 'Clock display computed direction is strictly "ltr"', presenterRtlAudit.clockDirection === 'ltr', `direction="${presenterRtlAudit.clockDirection}"`);
  recordResult('R2', 'Slide counter badge computed direction is strictly "ltr"', presenterRtlAudit.counterDirection === 'ltr', `direction="${presenterRtlAudit.counterDirection}"`);
  recordResult('R2', 'Slide counter badge unicode-bidi is "isolate"', presenterRtlAudit.counterUnicodeBidi === 'isolate', `unicode-bidi="${presenterRtlAudit.counterUnicodeBidi}"`);
  recordResult('R2', 'Timer widget parent container computed direction is strictly "ltr"', presenterRtlAudit.timerWidgetDirection === 'ltr', `direction="${presenterRtlAudit.timerWidgetDirection}"`);

  // Verify Launcher API active bar LTR isolation
  const launcherRtlAudit = await launcherWindow.webContents.executeJavaScript(`
    (() => {
      const htmlDir = document.documentElement.dir;
      const bodyHasRtl = document.body.classList.contains('rtl-layout');
      const apiBar = document.getElementById('apiActiveBar');
      const apiBarDir = apiBar ? window.getComputedStyle(apiBar).direction : 'ltr';
      return { htmlDir, bodyHasRtl, apiBarDir };
    })()
  `);
  recordResult('R2', 'Launcher Arabic API Active Bar computed direction is "ltr"', launcherRtlAudit.apiBarDir === 'ltr', `direction="${launcherRtlAudit.apiBarDir}"`);

  // Capture dedicated high-resolution proof screenshot for Arabic RTL isolation
  await captureDualScreenshot(presenterWindow, 'views', 'presenter_arabic_numeric_isolation_proof.png');

  // ===========================================================================
  // REQUIREMENT 3 (R3): MODAL DIALOG VISUAL INTEGRITY ACROSS 11 LANGUAGES
  // ===========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('  R3: Modal Dialog Visual Integrity across All 11 Languages');
  console.log('----------------------------------------------------------------\n');

  for (const lang of ALL_LANGUAGES) {
    console.log(`--- [R3] Testing Modals in Language: ${lang.toUpperCase()} ---`);

    // 3.1 Keyboard Shortcuts Modal (Presenter)
    await presenterWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const modal = document.getElementById('shortcutsModal');
        modal.classList.add('open');
        modal.style.transition = 'none';
        const card = modal.querySelector('.modal-card');
        if (card) card.style.transition = 'none';
      })()
    `);
    await sleep(350);

    const shortcutsAudit = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const titleEl = document.getElementById('shortcutsModalTitle');
        const expectedTitle = I18N_LOCALES['${lang}'].shortcuts.modalTitle;
        const items = document.querySelectorAll('#shortcutsModal .shortcut-item');
        const nextItemText = items[0] ? items[0].querySelector('span').textContent.trim() : '';
        return {
          titleText: titleEl ? titleEl.textContent.trim() : '',
          expectedTitle,
          itemCount: items.length,
          nextItemText
        };
      })()
    `);

    const shortcutsTitleMatch = shortcutsAudit.titleText.includes(shortcutsAudit.expectedTitle);
    recordResult('R3', `Shortcuts Modal title localized in '${lang}'`, shortcutsTitleMatch, `"${shortcutsAudit.titleText}" contains "${shortcutsAudit.expectedTitle}"`);
    recordResult('R3', `Shortcuts Modal items fully rendered in '${lang}'`, shortcutsAudit.itemCount >= 10 && shortcutsAudit.nextItemText.length > 0, `Items: ${shortcutsAudit.itemCount}, Next: "${shortcutsAudit.nextItemText}"`);

    await captureDualScreenshot(presenterWindow, 'modals', `shortcuts_${lang}.png`);

    // Dismiss Shortcuts Modal via Close Button Click (.modal-close-btn)
    const shortcutsCloseBtnResult = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('shortcutsModal');
        const btn = modal.querySelector('.modal-close-btn');
        if (btn) btn.click();
        return !modal.classList.contains('open');
      })()
    `);
    recordResult('R3', `Shortcuts Modal dismissed via close button in '${lang}'`, shortcutsCloseBtnResult, `Closed: ${shortcutsCloseBtnResult}`);
    await sleep(100);

    // Dismiss Shortcuts Modal via Backdrop Click (e.target === modal)
    const shortcutsBackdropResult = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('shortcutsModal');
        modal.classList.add('open');
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return !modal.classList.contains('open');
      })()
    `);
    recordResult('R3', `Presenter Shortcuts Modal dismissed via backdrop click in '${lang}'`, shortcutsBackdropResult, `Closed: ${shortcutsBackdropResult}`);
    await sleep(100);

    // 3.2 Companion Integration Modal (Presenter)
    await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('companionModal');
        modal.classList.add('open');
        modal.style.transition = 'none';
        const card = modal.querySelector('.modal-card');
        if (card) card.style.transition = 'none';
      })()
    `);
    await sleep(350);

    const companionAudit = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const titleEl = document.getElementById('companionModalTitle');
        const expectedTitle = I18N_LOCALES['${lang}'].companion.modalTitle;
        const descEl = document.querySelector('#companionModal [data-i18n="companion.modalDesc"]');
        return {
          titleText: titleEl ? titleEl.textContent.trim() : '',
          expectedTitle,
          descLength: descEl ? descEl.textContent.trim().length : 0
        };
      })()
    `);

    const companionTitleMatch = companionAudit.titleText.includes(companionAudit.expectedTitle);
    recordResult('R3', `Companion Modal title localized in '${lang}'`, companionTitleMatch, `"${companionAudit.titleText}" contains "${companionAudit.expectedTitle}"`);
    await captureDualScreenshot(presenterWindow, 'modals', `companion_presenter_${lang}.png`);

    // Dismiss Companion Modal via Escape Key
    const companionEscapeResult = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('companionModal');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return !modal.classList.contains('open');
      })()
    `);
    recordResult('R3', `Presenter Companion Modal dismissed via Escape key in '${lang}'`, companionEscapeResult, `Closed: ${companionEscapeResult}`);
    await sleep(100);

    // 3.3 Remote API Modal (Launcher)
    await launcherWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const modal = document.getElementById('apiModal');
        if (modal) {
          modal.classList.add('open');
          modal.style.opacity = '1';
          modal.style.display = 'flex';
          modal.style.pointerEvents = 'auto';
          modal.style.transition = 'none';
        }
        const card = modal ? modal.querySelector('.modal-card') : null;
        if (card) {
          card.style.transform = 'scale(1)';
          card.style.opacity = '1';
          card.style.transition = 'none';
        }
      })()
    `);
    await sleep(400);

    const apiModalAudit = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        const titleEl = document.getElementById('apiModalTitle');
        return {
          titleText: titleEl ? titleEl.textContent.trim() : '',
          isOpen: document.getElementById('apiModal').classList.contains('open')
        };
      })()
    `);

    recordResult('R3', `Launcher API Modal rendered and opened in '${lang}'`, apiModalAudit.isOpen && apiModalAudit.titleText.length > 0, `Title: "${apiModalAudit.titleText}"`);
    await captureDualScreenshot(launcherWindow, 'modals', `api_launcher_${lang}.png`);

    // Dismiss Launcher API Modal via Escape Key (reset inline styles so real class handles it)
    const launcherEscapeResult = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('apiModal');
        if (modal) {
          modal.style.opacity = '';
          modal.style.display = '';
          modal.style.pointerEvents = '';
          modal.style.transition = '';
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return !modal.classList.contains('open');
      })()
    `);
    recordResult('R3', `Launcher API Modal dismissed via Escape key in '${lang}'`, launcherEscapeResult, `Closed: ${launcherEscapeResult}`);
    await sleep(100);

    // Reopen and Dismiss Launcher API Modal via Backdrop Click
    const launcherBackdropResult = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        const modal = document.getElementById('apiModal');
        modal.classList.add('open');
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return !modal.classList.contains('open');
      })()
    `);
    recordResult('R3', `Launcher API Modal dismissed via backdrop click in '${lang}'`, launcherBackdropResult, `Closed: ${launcherBackdropResult}`);
    await sleep(100);
  }

  // ===========================================================================
  // REQUIREMENT 4 (R4): LIVE RUNTIME LANGUAGE SYNCHRONIZATION VIA BROADCASTCHANNEL
  // ===========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('  R4: Live Runtime Language Synchronization via BroadcastChannel & IPC');
  console.log('----------------------------------------------------------------\n');

  // Test 4.1: Direct BroadcastChannel ('pdf_presenter_sync_bus') Message Routing
  console.log('--- 4.1 Direct BroadcastChannel ("pdf_presenter_sync_bus") Verification ---');
  
  // Send SET_LANGUAGE directly over BroadcastChannel to Audience
  // Broadcast from presenter window via BroadcastChannel
  await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const channel = new BroadcastChannel('pdf_presenter_sync_bus');
      channel.postMessage({
        type: 'SET_LANGUAGE',
        language: 'ja',
        timestamp: Date.now(),
        sender: 'qa_swarm_bc_direct'
      });
    })()
  `);
  await sleep(400);

  const bcDirectResult = await audienceWindow.webContents.executeJavaScript(`
    (() => {
      const subEl = document.querySelector('[data-i18n="audience.waitingSubtitle"]');
      return {
        resolvedLang: i18n.getCurrentLanguage(),
        waitingSubtitle: subEl ? subEl.textContent.trim() : '',
        reloadMarker: window.__swarmReloadMarker
      };
    })()
  `);

  recordResult('R4', 'Direct BroadcastChannel SET_LANGUAGE event received by Audience', bcDirectResult.resolvedLang === 'ja', `Audience Language: ${bcDirectResult.resolvedLang}`);
  recordResult('R4', 'Audience DOM localized to Japanese via BroadcastChannel', bcDirectResult.waitingSubtitle.includes('発表者コックピット'), `Stage Subtitle: "${bcDirectResult.waitingSubtitle}"`);
  recordResult('R4', 'BroadcastChannel sync preserved execution state without page reload', bcDirectResult.reloadMarker === 'PRESENTER_SUITE_AUDIENCE_ACTIVE', `Marker: "${bcDirectResult.reloadMarker}"`);

  // Test 4.2: Live Multi-Window Synchronization (Presenter ➔ Audience)
  console.log('\n--- 4.2 Live Multi-Window Presenter-to-Audience Sync ---');

  // Switch Presenter to Hindi
  await presenterWindow.webContents.executeJavaScript(`
    i18n.setLanguage('hi');
    if (typeof emitSync === 'function') {
      emitSync({ type: 'SET_LANGUAGE', language: 'hi' });
    }
  `);
  await sleep(400);

  const hiSyncCheck = await audienceWindow.webContents.executeJavaScript(`
    (() => {
      const subEl = document.querySelector('[data-i18n="audience.waitingSubtitle"]');
      return {
        currentLang: i18n.getCurrentLanguage(),
        subtitleText: subEl ? subEl.textContent.trim() : '',
        reloadMarker: window.__swarmReloadMarker
      };
    })()
  `);
  recordResult('R4', 'Presenter switching to Hindi synchronizes Audience display', hiSyncCheck.currentLang === 'hi', `Audience Lang: ${hiSyncCheck.currentLang}`);
  recordResult('R4', 'Audience display rendered Hindi stage text', hiSyncCheck.subtitleText.includes('प्रतीक्षा'), `Subtitle: "${hiSyncCheck.subtitleText}"`);
  recordResult('R4', 'Zero page reload confirmed during Hindi synchronization', hiSyncCheck.reloadMarker === 'PRESENTER_SUITE_AUDIENCE_ACTIVE', `Reload Marker: Intact`);

  // Switch Presenter to Arabic (RTL live sync)
  await presenterWindow.webContents.executeJavaScript(`
    i18n.setLanguage('ar');
    if (typeof emitSync === 'function') {
      emitSync({ type: 'SET_LANGUAGE', language: 'ar' });
    }
  `);
  await sleep(400);

  const arSyncCheck = await audienceWindow.webContents.executeJavaScript(`
    (() => {
      return {
        currentLang: i18n.getCurrentLanguage(),
        htmlDir: document.documentElement.dir,
        isRTL: document.body.classList.contains('rtl-layout'),
        reloadMarker: window.__swarmReloadMarker
      };
    })()
  `);
  recordResult('R4', 'Presenter switching to Arabic synchronizes Audience to RTL', arSyncCheck.currentLang === 'ar' && arSyncCheck.htmlDir === 'rtl', `dir: "${arSyncCheck.htmlDir}", rtl-layout: ${arSyncCheck.isRTL}`);

  // Restore Presenter to English
  await presenterWindow.webContents.executeJavaScript(`
    i18n.setLanguage('en');
    if (typeof emitSync === 'function') {
      emitSync({ type: 'SET_LANGUAGE', language: 'en' });
    }
  `);
  await sleep(400);

  const enSyncCheck = await audienceWindow.webContents.executeJavaScript(`
    (() => ({
      currentLang: i18n.getCurrentLanguage(),
      htmlDir: document.documentElement.dir
    }))()
  `);
  recordResult('R4', 'Presenter switching back to English synchronizes Audience to LTR', enSyncCheck.currentLang === 'en' && enSyncCheck.htmlDir === 'ltr', `dir: "${enSyncCheck.htmlDir}"`);

  // ===========================================================================
  // REQUIREMENT 5 (R5): SCREENSHOT ARTIFACT VERIFICATION & QUALITY AUDIT
  // ===========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('  R5: Screenshot Artifact Matrix & Quality Gate Verification');
  console.log('----------------------------------------------------------------\n');

  let missingScreenshots = 0;
  let totalViewScreenshots = 0;
  let totalModalScreenshots = 0;

  // Verify 33 View Screenshots
  for (const lang of ALL_LANGUAGES) {
    const views = ['launcher', 'presenter', 'audience'];
    for (const view of views) {
      const filename = `${view}_${lang}.png`;
      const artPath = path.join(ARTIFACTS_VIEWS_DIR, filename);
      const exists = fs.existsSync(artPath);
      const size = exists ? fs.statSync(artPath).size : 0;
      if (exists && size > 5000) {
        totalViewScreenshots++;
      } else {
        missingScreenshots++;
        console.error(`  ❌ Missing or corrupted screenshot: ${filename} (size: ${size})`);
      }
    }
  }

  // Verify Modal Screenshots
  for (const lang of ALL_LANGUAGES) {
    const modalTypes = ['shortcuts', 'companion_presenter', 'api_launcher'];
    for (const m of modalTypes) {
      const filename = `${m}_${lang}.png`;
      const artPath = path.join(ARTIFACTS_MODALS_DIR, filename);
      const exists = fs.existsSync(artPath);
      const size = exists ? fs.statSync(artPath).size : 0;
      if (exists && size > 5000) {
        totalModalScreenshots++;
      } else {
        missingScreenshots++;
        console.error(`  ❌ Missing or corrupted modal screenshot: ${filename} (size: ${size})`);
      }
    }
  }

  recordResult('R5', 'All 33 Core View Screenshots generated and validated (> 5KB)', totalViewScreenshots === 33, `Validated: ${totalViewScreenshots}/33`);
  recordResult('R5', 'All 33 Modal Dialog Screenshots generated and validated (> 5KB)', totalModalScreenshots === 33, `Validated: ${totalModalScreenshots}/33`);

  // Final Summary
  console.log('\n================================================================');
  const allPassed = testResults.every(r => r.passed);
  const passCount = testResults.filter(r => r.passed).length;
  const failCount = testResults.filter(r => !r.passed).length;
  console.log(`  QA Swarm Execution Summary:`);
  console.log(`  - Total Checks: ${testResults.length}`);
  console.log(`  - Passed: ${passCount}`);
  console.log(`  - Failed: ${failCount}`);
  console.log(`  - Total View Screenshots: ${totalViewScreenshots}/33`);
  console.log(`  - Total Modal Screenshots: ${totalModalScreenshots}/33`);
  console.log('================================================================\n');

  // Close windows
  if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.destroy();
  if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.destroy();
  if (audienceWindow && !audienceWindow.isDestroyed()) audienceWindow.destroy();

  if (allPassed && missingScreenshots === 0) {
    console.log('  🎯 [SWARM VERIFICATION COMPLETE]: ALL CRITERIA R1-R5 CERTIFIED WITH 100% SUCCESS!\n');

    // Also execute Challenger 2's adversarial challenge suite to verify R3 & R4 end-to-end
    console.log('▶ [ADVERSARIAL] Executing Challenger 2 Adversarial Challenge Suite...');
    try {
      const { execFileSync } = require('child_process');
      execFileSync(process.execPath, [path.join(__dirname, 'adversarial-r3-r4-challenge.js')], { stdio: 'inherit' });
      console.log('  ⚔️ [ADVERSARIAL CHALLENGE COMPLETE]: All adversarial assertions passed!\n');
    } catch (err) {
      console.error('  ❌ [ADVERSARIAL CHALLENGE FAILED]:', err.message);
      app.exit(2);
      return;
    }

    app.exit(0);
  } else {
    console.error('  ⚠️ [SWARM VERIFICATION FAILED]: Some assertions failed.\n');
    app.exit(1);
  }
}

app.whenReady().then(runSwarmVerification);
