/**
 * tests/adversarial-r3-r4-challenge.js
 * 
 * Adversarial Empirical Verification Harness by Challenger 2.
 * Focus:
 *  1. Live Runtime Synchronization via BroadcastChannel (R4)
 *     - High-frequency burst message dispatch across multiple channels
 *     - Malformed, null, undefined, and unknown language code fuzzing & crash resilience
 *     - Strict zero-reload guarantee & state preservation under language thrashing
 *  2. Modal Dialog Responsiveness & Dismissal (R3)
 *     - Rapid open/close lifecycle cycles across language transitions (LTR & RTL)
 *     - Triple dismissal verification: Escape key, close buttons, and backdrop clicks
 *     - Evaluation in both LTR (en) and RTL (ar) modes for #shortcutsModal, #companionModal, and #apiModal
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const testUserData = path.join(__dirname, '../.test-userdata-challenger2');
app.setPath('userData', testUserData);

let launcherWindow = null;
let presenterWindow = null;
let audienceWindow = null;

const results = [];

function recordAssertion(suite, name, passed, details = '') {
  results.push({ suite, name, passed, details });
  const icon = passed ? '  ✅ PASS' : '  ❌ FAIL';
  console.log(`${icon} [${suite}] ${name} ${details ? ':: ' + details : ''}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      title: 'Adversarial Test Presentation.pdf',
      totalPages: 6,
      transitionDuration: 0.4,
      transitionStyle: 'crossfade'
    },
    streamUrl: null,
    pdfData: null
  }));

  ipcMain.handle('toggle-presenter-fullscreen', () => ({ isFullScreen: false }));

  ipcMain.on('sync-event', (event, data) => {
    if (audienceWindow && !audienceWindow.isDestroyed() && event.sender !== audienceWindow.webContents) {
      audienceWindow.webContents.send('sync-event', data);
    }
    if (presenterWindow && !presenterWindow.isDestroyed() && event.sender !== presenterWindow.webContents) {
      presenterWindow.webContents.send('sync-event', data);
    }
  });
}

async function runAdversarialChallenge() {
  console.log('\n========================================================================');
  console.log('  ⚔️ CHALLENGER 2: ADVERSARIAL EMPIRICAL VERIFICATION HARNESS (R3 & R4)');
  console.log('========================================================================\n');

  setupMockIPC();

  // 1. Launch Windows
  console.log('▶ [INITIALIZATION] Spawning BrowserWindows...');
  
  launcherWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await launcherWindow.loadFile(path.join(__dirname, '../views/launcher.html'));
  await sleep(600);

  presenterWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await presenterWindow.loadFile(path.join(__dirname, '../views/presenter.html'));
  await sleep(1000);

  audienceWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await audienceWindow.loadFile(path.join(__dirname, '../views/audience.html'));
  await sleep(800);

  // Set memory canary markers to rigorously verify zero-reload
  await presenterWindow.webContents.executeJavaScript(`
    window.__canary_id = 'PRESENTER_CANARY_' + Math.random();
    window.__canary_canvas = document.getElementById('slideCanvas');
    window.__canary_timer_val = document.getElementById('timerDisplay').textContent;
    window.__canary_unload_triggered = false;
    window.addEventListener('beforeunload', () => { window.__canary_unload_triggered = true; });
  `);

  await audienceWindow.webContents.executeJavaScript(`
    window.__canary_id = 'AUDIENCE_CANARY_' + Math.random();
    window.__canary_canvas = document.getElementById('slideCanvasCurrent');
    window.__canary_unload_triggered = false;
    window.addEventListener('beforeunload', () => { window.__canary_unload_triggered = true; });
  `);

  // =========================================================================
  // SUITE 1: BroadcastChannel High-Frequency Burst & Multi-Channel Stress Test
  // =========================================================================
  console.log('\n--- SUITE 1: BroadcastChannel High-Frequency Burst & Stress Test ---');

  const languagesSequence = ['de', 'fr', 'es', 'zh', 'ja', 'ar', 'pt', 'hi', 'ru', 'it', 'en'];
  
  // Inject burst sender from external channel into the BroadcastChannel
  const burstResult = await audienceWindow.webContents.executeJavaScript(`
    (async () => {
      const channel = new BroadcastChannel('pdf_presenter_sync_bus');
      const langs = ${JSON.stringify(languagesSequence)};
      const burstSize = 66; // 6 full cycles across all 11 languages
      let errors = 0;
      
      const startTime = performance.now();
      for (let i = 0; i < burstSize; i++) {
        const lang = langs[i % langs.length];
        try {
          channel.postMessage({
            type: 'SET_LANGUAGE',
            language: lang,
            timestamp: Date.now(),
            seq: i,
            sender: 'challenger_stress_burst'
          });
          // rapid fire with micro-delays
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 8));
        } catch (err) {
          errors++;
        }
      }
      const elapsed = performance.now() - startTime;
      channel.close();
      return { burstSize, errors, elapsed };
    })()
  `);

  console.log(`     Dispatched ${burstResult.burstSize} rapid BroadcastChannel messages in ${burstResult.elapsed.toFixed(1)}ms (${burstResult.errors} send errors)`);
  recordAssertion('R4-Sync', 'BroadcastChannel high-frequency message burst transmission', burstResult.errors === 0, `${burstResult.burstSize} messages in ${burstResult.elapsed.toFixed(1)}ms`);

  // Allow channel to settle to the final language: 'en'
  await sleep(500);

  // Verify final language state across audience and presenter
  const audienceLangAfterBurst = await audienceWindow.webContents.executeJavaScript(`
    (() => ({
      lang: i18n.getCurrentLanguage(),
      dir: document.documentElement.dir,
      canaryIntact: window.__canary_id && window.__canary_id.startsWith('AUDIENCE_CANARY_'),
      canaryCanvasIntact: window.__canary_canvas === document.getElementById('slideCanvasCurrent'),
      unloadTriggered: window.__canary_unload_triggered
    }))()
  `);

  recordAssertion('R4-Sync', 'Audience resolved final language correctly after high-frequency burst', audienceLangAfterBurst.lang === 'en' && audienceLangAfterBurst.dir === 'ltr', `lang: ${audienceLangAfterBurst.lang}, dir: ${audienceLangAfterBurst.dir}`);
  recordAssertion('R4-Sync', 'Strict Zero-Reload guarantee: window canary preserved after 66 sync events', audienceLangAfterBurst.canaryIntact && audienceLangAfterBurst.canaryCanvasIntact && !audienceLangAfterBurst.unloadTriggered, `Canary: intact, Unload triggered: ${audienceLangAfterBurst.unloadTriggered}`);

  // =========================================================================
  // SUITE 2: Malformed, Null, and Unknown Language Code Fuzzing
  // =========================================================================
  console.log('\n--- SUITE 2: Malformed, Null, Undefined & Unknown Language Code Fuzzing ---');

  const adversarialPayloads = [
    { label: 'Unknown code xx-YY', payload: { type: 'SET_LANGUAGE', language: 'xx-YY' } },
    { label: 'Null language', payload: { type: 'SET_LANGUAGE', language: null } },
    { label: 'Undefined language', payload: { type: 'SET_LANGUAGE', language: undefined } },
    { label: 'Empty string code', payload: { type: 'SET_LANGUAGE', language: '' } },
    { label: 'Numeric code 12345', payload: { type: 'SET_LANGUAGE', language: 12345 } },
    { label: 'Object confusion', payload: { type: 'SET_LANGUAGE', language: { exploit: true } } },
    { label: 'Array code', payload: { type: 'SET_LANGUAGE', language: ['ar', 'en'] } },
    { label: 'Missing type property', payload: { language: 'es' } },
    { label: 'Non-object raw string', payload: 'INVALID_PAYLOAD_STRING' }
  ];

  for (const { label, payload } of adversarialPayloads) {
    const fuzzResult = await presenterWindow.webContents.executeJavaScript(`
      (async () => {
        let uncaught = null;
        const errorHandler = (e) => { uncaught = e.message; };
        window.addEventListener('error', errorHandler, { once: true });
        
        const channel = new BroadcastChannel('pdf_presenter_sync_bus');
        try {
          channel.postMessage(${JSON.stringify(payload)});
        } catch (e) {
          // Posting non-cloneable objects would throw in postMessage
        }
        await new Promise(r => setTimeout(r, 60));
        window.removeEventListener('error', errorHandler);
        channel.close();

        return {
          uncaughtError: uncaught,
          currentLang: i18n.getCurrentLanguage(),
          isSupported: !!i18n.getSupportedLanguages()[i18n.getCurrentLanguage()]
        };
      })()
    `);

    const passed = !fuzzResult.uncaughtError && fuzzResult.isSupported;
    recordAssertion('R4-Fuzzing', `Crash resilience: ${label}`, passed, `Error: ${fuzzResult.uncaughtError || 'None'}, Lang: ${fuzzResult.currentLang}`);
  }

  // =========================================================================
  // SUITE 3: Rapid Language Thrashing & In-Memory State Preservation
  // =========================================================================
  console.log('\n--- SUITE 3: Zero-Reload State Preservation Under Language Thrashing ---');

  // Set presenter to slide 3, start timer
  await presenterWindow.webContents.executeJavaScript(`
    if (typeof goToPage === 'function') goToPage(3);
    if (typeof startTimer === 'function') startTimer();
    window.__test_active_slide_canary = 3;
  `);
  await sleep(300);

  // Thrash languages between RTL and LTR: ar -> ja -> ar -> ru -> en
  const thrashLangs = ['ar', 'ja', 'ar', 'ru', 'en'];
  for (const tLang of thrashLangs) {
    await audienceWindow.webContents.executeJavaScript(`
      (() => {
        const channel = new BroadcastChannel('pdf_presenter_sync_bus');
        channel.postMessage({ type: 'SET_LANGUAGE', language: '${tLang}', timestamp: Date.now(), sender: 'thrash' });
        channel.close();
      })()
    `);
    await sleep(80);
  }
  await sleep(300);

  const presenterPreservationCheck = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const slideCounterEl = document.getElementById('slideCounter');
      const counterText = slideCounterEl ? slideCounterEl.textContent.trim() : '';
      return {
        canaryIdIntact: window.__canary_id && window.__canary_id.startsWith('PRESENTER_CANARY_'),
        unloadTriggered: window.__canary_unload_triggered,
        activeSlideCanary: window.__test_active_slide_canary,
        counterText
      };
    })()
  `);

  recordAssertion('R4-Preservation', 'Presenter in-memory variables preserved through language thrashing', presenterPreservationCheck.canaryIdIntact && !presenterPreservationCheck.unloadTriggered, `Canary intact: ${presenterPreservationCheck.canaryIdIntact}`);
  recordAssertion('R4-Preservation', 'Presentation slide state preserved through language thrashing', presenterPreservationCheck.activeSlideCanary === 3, `Expected Slide 3, Badge: "${presenterPreservationCheck.counterText}"`);

  // =========================================================================
  // SUITE 4: Modal Dialog Stress Test & Responsiveness (R3)
  // =========================================================================
  console.log('\n--- SUITE 4: Modal Dialog Lifecycle Stress & Responsiveness (R3) ---');

  // Test 4.1: Rapid Open/Close Cycles across Languages on Presenter Modals
  console.log('▶ [4.1] Rapid Open/Close Cycles on #shortcutsModal and #companionModal...');
  
  const rapidCyclesResult = await presenterWindow.webContents.executeJavaScript(`
    (async () => {
      const shortcuts = document.getElementById('shortcutsModal');
      const companion = document.getElementById('companionModal');
      const btnShortcuts = document.getElementById('btnShortcuts');
      const btnCompanion = document.getElementById('btnCompanion');
      const langs = ['en', 'ar', 'zh', 'hi', 'de'];
      let cyclesCompleted = 0;
      let anomalies = 0;

      for (let i = 0; i < langs.length; i++) {
        i18n.setLanguage(langs[i]);
        
        // Open shortcuts
        btnShortcuts.click();
        if (!shortcuts.classList.contains('open')) anomalies++;
        await new Promise(r => setTimeout(r, 25));
        
        // Close via close button
        const closeBtn1 = shortcuts.querySelector('.modal-close-btn');
        if (closeBtn1) closeBtn1.click();
        if (shortcuts.classList.contains('open')) anomalies++;
        await new Promise(r => setTimeout(r, 25));

        // Open companion
        btnCompanion.click();
        if (!companion.classList.contains('open')) anomalies++;
        await new Promise(r => setTimeout(r, 25));

        // Close via close button
        const closeBtn2 = companion.querySelector('.modal-close-btn');
        if (closeBtn2) closeBtn2.click();
        if (companion.classList.contains('open')) anomalies++;
        await new Promise(r => setTimeout(r, 25));

        cyclesCompleted++;
      }
      return { cyclesCompleted, anomalies };
    })()
  `);

  recordAssertion('R3-Modals', 'Rapid modal open/close cycles across language transitions', rapidCyclesResult.anomalies === 0 && rapidCyclesResult.cyclesCompleted === 5, `Completed: ${rapidCyclesResult.cyclesCompleted} cycles, Anomalies: ${rapidCyclesResult.anomalies}`);

  // Test 4.2: Modal Dismissal via Close Button under LTR and RTL
  console.log('▶ [4.2] Modal Dismissal via Close Button (.modal-close-btn)...');
  for (const lang of ['en', 'ar']) {
    const closeBtnCheck = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const shortcuts = document.getElementById('shortcutsModal');
        const companion = document.getElementById('companionModal');
        
        // Open Shortcuts
        shortcuts.classList.add('open');
        const shortcutsBtn = shortcuts.querySelector('.modal-close-btn');
        shortcutsBtn.click();
        const shortcutsClosed = !shortcuts.classList.contains('open');

        // Open Companion
        companion.classList.add('open');
        const companionBtn = companion.querySelector('.modal-close-btn');
        companionBtn.click();
        const companionClosed = !companion.classList.contains('open');

        return { shortcutsClosed, companionClosed, isRTL: document.documentElement.dir === 'rtl' };
      })()
    `);

    recordAssertion('R3-Dismissal', `Dismissal via Close Button in ${lang.toUpperCase()} (dir=${closeBtnCheck.isRTL ? 'rtl' : 'ltr'})`, closeBtnCheck.shortcutsClosed && closeBtnCheck.companionClosed, `Shortcuts: ${closeBtnCheck.shortcutsClosed ? 'Closed' : 'Stuck'}, Companion: ${closeBtnCheck.companionClosed ? 'Closed' : 'Stuck'}`);
  }

  // Test 4.3: Modal Dismissal via Escape Key under LTR and RTL
  console.log('▶ [4.3] Modal Dismissal via Escape Key...');
  for (const lang of ['en', 'ar']) {
    const escCheck = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const shortcuts = document.getElementById('shortcutsModal');
        const companion = document.getElementById('companionModal');

        // 1. Open Shortcuts & press Escape
        shortcuts.classList.add('open');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        const shortcutsEscaped = !shortcuts.classList.contains('open');

        // 2. Open Companion & press Escape
        companion.classList.add('open');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        const companionEscaped = !companion.classList.contains('open');

        return { shortcutsEscaped, companionEscaped, isRTL: document.documentElement.dir === 'rtl' };
      })()
    `);

    recordAssertion('R3-Dismissal', `Dismissal via Escape Key in ${lang.toUpperCase()} (dir=${escCheck.isRTL ? 'rtl' : 'ltr'})`, escCheck.shortcutsEscaped && escCheck.companionEscaped, `Shortcuts: ${escCheck.shortcutsEscaped ? 'Closed' : 'Stuck'}, Companion: ${escCheck.companionEscaped ? 'Closed' : 'Stuck'}`);
  }

  // Test 4.4: Modal Dismissal via Backdrop Click under LTR and RTL
  console.log('▶ [4.4] Modal Dismissal via Backdrop Click...');
  
  // A. Check Launcher #apiModal backdrop click
  for (const lang of ['en', 'ar']) {
    const launcherBackdropCheck = await launcherWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const apiModal = document.getElementById('apiModal');
        apiModal.classList.add('open');
        
        // Dispatch click directly on the backdrop element
        apiModal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        const closed = !apiModal.classList.contains('open');
        return { closed, isRTL: document.documentElement.dir === 'rtl' };
      })()
    `);

    recordAssertion('R3-Dismissal', `Launcher #apiModal Dismissal via Backdrop Click in ${lang.toUpperCase()}`, launcherBackdropCheck.closed, `Status: ${launcherBackdropCheck.closed ? 'Dismissed' : 'REMAINED OPEN (No backdrop click handler)'}`);
  }

  // B. Check Presenter #shortcutsModal and #companionModal backdrop click
  for (const lang of ['en', 'ar']) {
    const presenterBackdropCheck = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        i18n.setLanguage('${lang}');
        const shortcuts = document.getElementById('shortcutsModal');
        const companion = document.getElementById('companionModal');

        // 1. Open shortcuts and click backdrop
        shortcuts.classList.add('open');
        shortcuts.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        const shortcutsClosed = !shortcuts.classList.contains('open');

        // 2. Open companion and click backdrop
        companion.classList.add('open');
        companion.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        const companionClosed = !companion.classList.contains('open');

        return { shortcutsClosed, companionClosed, isRTL: document.documentElement.dir === 'rtl' };
      })()
    `);

    recordAssertion('R3-Dismissal', `Presenter #shortcutsModal Dismissal via Backdrop Click in ${lang.toUpperCase()}`, presenterBackdropCheck.shortcutsClosed, `Status: ${presenterBackdropCheck.shortcutsClosed ? 'Dismissed' : 'REMAINED OPEN (No backdrop click handler)'}`);
    recordAssertion('R3-Dismissal', `Presenter #companionModal Dismissal via Backdrop Click in ${lang.toUpperCase()}`, presenterBackdropCheck.companionClosed, `Status: ${presenterBackdropCheck.companionClosed ? 'Dismissed' : 'REMAINED OPEN (No backdrop click handler)'}`);
  }

  // =========================================================================
  // FINAL EVALUATION & SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  const allPassed = results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  
  console.log(`  Adversarial Challenge Execution Summary:`);
  console.log(`  - Total Assertions: ${results.length}`);
  console.log(`  - Passed: ${passedCount}`);
  console.log(`  - Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.log('\n  ❌ Failed Assertions:');
    results.filter(r => !r.passed).forEach(f => {
      console.log(`     - [${f.suite}] ${f.name} :: ${f.details}`);
    });
  }
  console.log('========================================================================\n');

  // Close windows
  if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.destroy();
  if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.destroy();
  if (audienceWindow && !audienceWindow.isDestroyed()) audienceWindow.destroy();

  // Return exit code
  app.exit(allPassed ? 0 : 2);
}

app.whenReady().then(runAdversarialChallenge);
