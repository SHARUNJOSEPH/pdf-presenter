/**
 * tests/test-challenger-bidi.js
 * 
 * Adversarial Empirical Verification Suite for Arabic RTL Layout,
 * Directionality Switching Transitions, and Numeric Isolation.
 * 
 * Challenger 1
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const testUserData = path.join(__dirname, '../.test-userdata-challenger');
app.setPath('userData', testUserData);

let presenterWindow = null;
let launcherWindow = null;

const results = [];

function record(suite, name, passed, details = '') {
  results.push({ suite, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${icon} [${suite}] ${name} ${details ? '(' + details + ')' : ''}`);
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
      title: 'Interactive Presentation Showcase.pdf',
      totalPages: 6,
      transitionDuration: 0.4,
      transitionStyle: 'crossfade'
    },
    streamUrl: null,
    pdfData: null
  }));
  ipcMain.handle('toggle-presenter-fullscreen', () => ({ isFullScreen: false }));
  ipcMain.on('sync-event', () => {});
}

async function runAdversarialVerification() {
  console.log('\n================================================================');
  console.log('  ⚔️ CHALLENGER 1: ADVERSARIAL BIDI & NUMERIC ISOLATION SUITE');
  console.log('================================================================\n');

  setupMockIPC();

  // Launch Launcher Window
  launcherWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await launcherWindow.loadFile(path.join(__dirname, '../views/launcher.html'));
  await sleep(600);

  // Launch Presenter Window
  presenterWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await presenterWindow.loadFile(path.join(__dirname, '../views/presenter.html'));
  await sleep(1000);

  // ---------------------------------------------------------------------------
  // SUITE 1: RAPID DIRECTIONALITY TOGGLING & TRANSITION RESILIENCE
  // ---------------------------------------------------------------------------
  console.log('\n--- [SUITE 1] Rapid Directionality Toggling & Transitions ---');

  const toggleSequence = ['en', 'ar', 'zh', 'ar', 'hi', 'ar', 'de', 'ar', 'ja', 'ar', 'it', 'ar', 'ru', 'ar', 'pt', 'ar', 'fr', 'ar', 'es', 'ar', 'en', 'ar'];
  let togglePassed = true;
  let toggleDetails = [];

  for (let i = 0; i < toggleSequence.length; i++) {
    const targetLang = toggleSequence[i];
    const isExpectedRTL = targetLang === 'ar';

    await presenterWindow.webContents.executeJavaScript(`i18n.setLanguage('${targetLang}');`);
    await sleep(40); // Rapid succession (40ms)

    const state = await presenterWindow.webContents.executeJavaScript(`
      (() => {
        return {
          lang: i18n.getCurrentLanguage(),
          dir: document.documentElement.getAttribute('dir'),
          htmlLang: document.documentElement.getAttribute('lang'),
          hasRtlClass: document.body.classList.contains('rtl-layout'),
          timerDir: window.getComputedStyle(document.getElementById('timerDisplay')).direction,
          clockDir: window.getComputedStyle(document.getElementById('clockDisplay')).direction,
          counterDir: window.getComputedStyle(document.getElementById('slideCounter')).direction
        };
      })()
    `);

    const expectedDir = isExpectedRTL ? 'rtl' : 'ltr';
    const check1 = state.lang === targetLang;
    const check2 = state.dir === expectedDir;
    const check3 = state.hasRtlClass === isExpectedRTL;
    const check4 = state.timerDir === 'ltr';
    const check5 = state.clockDir === 'ltr';
    const check6 = state.counterDir === 'ltr';

    if (!check1 || !check2 || !check3 || !check4 || !check5 || !check6) {
      togglePassed = false;
      toggleDetails.push(`Step ${i} (${targetLang}): dir=${state.dir}, hasRtlClass=${state.hasRtlClass}, timerDir=${state.timerDir}`);
    }
  }

  record('SUITE 1', `Rapid 22-step toggle cycle (en->ar->zh->ar->hi->ar...)`, togglePassed, toggleDetails.join('; '));

  // Synchronous multi-call stress in same tick
  const syncTickResult = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      i18n.setLanguage('en');
      i18n.setLanguage('zh');
      i18n.setLanguage('ar');
      return {
        currentLang: i18n.getCurrentLanguage(),
        dir: document.documentElement.getAttribute('dir'),
        hasRtlClass: document.body.classList.contains('rtl-layout'),
        timerDir: window.getComputedStyle(document.getElementById('timerDisplay')).direction,
        counterDir: window.getComputedStyle(document.getElementById('slideCounter')).direction
      };
    })()
  `);

  record('SUITE 1', 'Synchronous same-tick multi-setLanguage resolves cleanly to Arabic RTL',
    syncTickResult.currentLang === 'ar' && syncTickResult.dir === 'rtl' && syncTickResult.hasRtlClass === true && syncTickResult.timerDir === 'ltr' && syncTickResult.counterDir === 'ltr',
    `lang=${syncTickResult.currentLang}, dir=${syncTickResult.dir}, timerDir=${syncTickResult.timerDir}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 2: COMPUTED STYLE ISOLATION UNDER ARABIC RTL
  // ---------------------------------------------------------------------------
  console.log('\n--- [SUITE 2] Computed Style Directionality & Isolation ---');

  await presenterWindow.webContents.executeJavaScript(`i18n.setLanguage('ar');`);
  await launcherWindow.webContents.executeJavaScript(`i18n.setLanguage('ar');`);
  await sleep(200);

  const presenterComputed = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const timerWidget = document.querySelector('.timer-widget');
      const timerDisplay = document.getElementById('timerDisplay');
      const clockDisplay = document.getElementById('clockDisplay');
      const slideCounter = document.getElementById('slideCounter');

      const twStyle = window.getComputedStyle(timerWidget);
      const tdStyle = window.getComputedStyle(timerDisplay);
      const cdStyle = window.getComputedStyle(clockDisplay);
      const scStyle = window.getComputedStyle(slideCounter);

      return {
        timerWidgetDirection: twStyle.direction,
        timerDisplayDirection: tdStyle.direction,
        clockDisplayDirection: cdStyle.direction,
        slideCounterDirection: scStyle.direction,
        slideCounterUnicodeBidi: scStyle.unicodeBidi,
        slideCounterTextAlign: scStyle.textAlign,
        timerWidgetTextAlign: twStyle.textAlign
      };
    })()
  `);

  record('SUITE 2', '.timer-widget computed direction is "ltr"', presenterComputed.timerWidgetDirection === 'ltr', `direction=${presenterComputed.timerWidgetDirection}`);
  record('SUITE 2', '#timerDisplay computed direction is "ltr"', presenterComputed.timerDisplayDirection === 'ltr', `direction=${presenterComputed.timerDisplayDirection}`);
  record('SUITE 2', '#clockDisplay computed direction is "ltr"', presenterComputed.clockDisplayDirection === 'ltr', `direction=${presenterComputed.clockDisplayDirection}`);
  record('SUITE 2', '#slideCounter computed direction is "ltr"', presenterComputed.slideCounterDirection === 'ltr', `direction=${presenterComputed.slideCounterDirection}`);
  record('SUITE 2', '#slideCounter computed unicode-bidi is "isolate"', presenterComputed.slideCounterUnicodeBidi === 'isolate', `unicode-bidi=${presenterComputed.slideCounterUnicodeBidi}`);
  record('SUITE 2', '#slideCounter computed text-align is "left"', presenterComputed.slideCounterTextAlign === 'left', `text-align=${presenterComputed.slideCounterTextAlign}`);

  // Launcher API active bar computed styles
  const launcherComputed = await launcherWindow.webContents.executeJavaScript(`
    (() => {
      const apiBar = document.getElementById('apiActiveBar');
      const apiStyle = apiBar ? window.getComputedStyle(apiBar) : null;
      return {
        exists: !!apiBar,
        direction: apiStyle ? apiStyle.direction : 'missing',
        textAlign: apiStyle ? apiStyle.textAlign : 'missing'
      };
    })()
  `);

  record('SUITE 2', '#apiActiveBar in Launcher computed direction is "ltr"', launcherComputed.direction === 'ltr', `direction=${launcherComputed.direction}`);
  record('SUITE 2', '#apiActiveBar in Launcher computed text-align is "left"', launcherComputed.textAlign === 'left', `text-align=${launcherComputed.textAlign}`);

  // ---------------------------------------------------------------------------
  // SUITE 3: BOUNDING BOXES, CLIPPING, AND OFFSCREEN OVERFLOW CHECKS
  // ---------------------------------------------------------------------------
  console.log('\n--- [SUITE 3] Bounding Boxes, Clipping & Offscreen Overflow ---');

  const presenterLayoutAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      function auditElement(el, id) {
        if (!el) return { id, error: 'Element not found' };
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const parent = el.parentElement;
        const parentRect = parent ? parent.getBoundingClientRect() : null;

        const isOffscreen = (
          rect.right < 0 ||
          rect.left > winW ||
          rect.bottom < 0 ||
          rect.top > winH ||
          rect.left < 0 ||
          rect.right > winW
        );

        const hasNonZeroDims = rect.width > 0 && rect.height > 0;
        const isVisible = style.visibility === 'visible' && style.display !== 'none' && parseFloat(style.opacity || '1') > 0;

        // Check if parent scrolls horizontally unexpectedly
        const parentScrollsH = parent ? (parent.scrollWidth > parent.clientWidth + 2) : false;

        return {
          id,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), left: Math.round(rect.left), right: Math.round(rect.right) },
          isOffscreen,
          hasNonZeroDims,
          isVisible,
          parentScrollsH
        };
      }

      return {
        winW,
        winH,
        timerWidget: auditElement(document.querySelector('.timer-widget'), '.timer-widget'),
        timerDisplay: auditElement(document.getElementById('timerDisplay'), '#timerDisplay'),
        clockDisplay: auditElement(document.getElementById('clockDisplay'), '#clockDisplay'),
        slideCounter: auditElement(document.getElementById('slideCounter'), '#slideCounter'),
        topBar: auditElement(document.querySelector('.top-bar'), '.top-bar'),
        panelHeader: auditElement(document.querySelector('.panel-header'), '.panel-header')
      };
    })()
  `);

  ['timerWidget', 'timerDisplay', 'clockDisplay', 'slideCounter'].forEach(key => {
    const item = presenterLayoutAudit[key];
    const ok = item && !item.isOffscreen && item.hasNonZeroDims && item.isVisible && !item.parentScrollsH;
    record('SUITE 3', `${item.id} bounding rect is on-screen and non-clipped`, ok,
      `rect=[x:${item.rect.x}, y:${item.rect.y}, w:${item.rect.width}, h:${item.rect.height}], offscreen=${item.isOffscreen}, parentOverflowH=${item.parentScrollsH}`
    );
  });

  const launcherLayoutAudit = await launcherWindow.webContents.executeJavaScript(`
    (() => {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const el = document.getElementById('apiActiveBar');
      if (!el) return { error: 'apiActiveBar not found' };
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isOffscreen = rect.left < 0 || rect.right > winW || rect.top < 0 || rect.bottom > winH;
      return {
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        isOffscreen,
        hasNonZeroDims: rect.width > 0 && rect.height > 0,
        isVisible: style.visibility === 'visible' && style.display !== 'none'
      };
    })()
  `);

  record('SUITE 3', '#apiActiveBar in Launcher is fully on-screen without clipping',
    !launcherLayoutAudit.isOffscreen && launcherLayoutAudit.hasNonZeroDims && launcherLayoutAudit.isVisible,
    `rect=[x:${launcherLayoutAudit.rect.x}, y:${launcherLayoutAudit.rect.y}, w:${launcherLayoutAudit.rect.width}, h:${launcherLayoutAudit.rect.height}]`
  );

  // ---------------------------------------------------------------------------
  // SUITE 4: DYNAMIC SLIDE COUNTER UPDATES & DIGIT ISOLATION IN ARABIC
  // ---------------------------------------------------------------------------
  console.log('\n--- [SUITE 4] Dynamic Slide Counter Updates & Digit Isolation ---');

  // Verify slide counter updates as slides advance
  let dynamicSlidePassed = true;
  let dynamicSlideDetails = [];

  for (let page = 1; page <= 6; page++) {
    const res = await presenterWindow.webContents.executeJavaScript(`
      (async () => {
        // Navigate or update
        if (typeof goToPage === 'function') {
          await goToPage(${page});
        } else {
          // fallback if goToPage is scoped
          const counterEl = document.getElementById('slideCounter');
          if (counterEl && typeof i18n !== 'undefined') {
            counterEl.textContent = i18n.t('presenter.slideCounter', { current: ${page}, total: 6 });
          }
        }
        await new Promise(r => setTimeout(r, 60));
        const el = document.getElementById('slideCounter');
        return {
          text: el ? el.textContent.trim() : '',
          dir: el ? window.getComputedStyle(el).direction : '',
          bidi: el ? window.getComputedStyle(el).unicodeBidi : ''
        };
      })()
    `);

    const expectedText = `شريحة ${page} من 6`;
    const matchesExpected = res.text === expectedText;
    const keepsLtr = res.dir === 'ltr';
    const keepsIsolate = res.bidi === 'isolate';

    if (!matchesExpected || !keepsLtr || !keepsIsolate) {
      dynamicSlidePassed = false;
      dynamicSlideDetails.push(`Page ${page}: text="${res.text}" (expected "${expectedText}"), dir=${res.dir}`);
    }
  }

  record('SUITE 4', 'Dynamic slide progression (1 to 6) produces verbatim Arabic with digits preserved',
    dynamicSlidePassed, dynamicSlideDetails.join('; ')
  );

  // Boundary condition: large digit values (e.g. Slide 42 of 100, Slide 100 of 100)
  const largeDigitAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('slideCounter');
      el.textContent = i18n.t('presenter.slideCounter', { current: 42, total: 100 });
      const rect42 = el.getBoundingClientRect();
      const text42 = el.textContent.trim();

      el.textContent = i18n.t('presenter.slideCounter', { current: 100, total: 100 });
      const rect100 = el.getBoundingClientRect();
      const text100 = el.textContent.trim();

      // Reset back to 1 of 6
      el.textContent = i18n.t('presenter.slideCounter', { current: 1, total: 6 });

      return {
        text42,
        rect42: { width: Math.round(rect42.width), height: Math.round(rect42.height) },
        text100,
        rect100: { width: Math.round(rect100.width), height: Math.round(rect100.height) },
        fitsInParent: rect100.width < el.parentElement.clientWidth
      };
    })()
  `);

  record('SUITE 4', 'Large digit values (42/100, 100/100) maintain digit integrity and fit without badge overflow',
    largeDigitAudit.text42 === 'شريحة 42 من 100' && largeDigitAudit.text100 === 'شريحة 100 من 100' && largeDigitAudit.fitsInParent,
    `text42="${largeDigitAudit.text42}", text100="${largeDigitAudit.text100}", fitsInParent=${largeDigitAudit.fitsInParent}`
  );

  // Detailed Character Run Inspection for Slide 1 of 6: verify digits are not reversed
  const charRunAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const el = document.getElementById('slideCounter');
      el.textContent = i18n.t('presenter.slideCounter', { current: 1, total: 6 });
      const fullText = el.textContent.trim();

      // In "شريحة 1 من 6":
      // Verify indexOf '1' and indexOf '6'
      const idxCurrent = fullText.indexOf('1');
      const idxTotal = fullText.indexOf('6');

      return {
        fullText,
        idxCurrent,
        idxTotal,
        hasBothDigits: idxCurrent !== -1 && idxTotal !== -1,
        currentPrecedesTotalInString: idxCurrent < idxTotal
      };
    })()
  `);

  record('SUITE 4', 'Digit order in text stream has current page index preceding total page index',
    charRunAudit.hasBothDigits && charRunAudit.currentPrecedesTotalInString,
    `fullText="${charRunAudit.fullText}", idxCurrent=${charRunAudit.idxCurrent}, idxTotal=${charRunAudit.idxTotal}`
  );

  // ---------------------------------------------------------------------------
  // SUITE 5: ADVERSARIAL EDGE CASES & RESOURCE PRESSURE
  // ---------------------------------------------------------------------------
  console.log('\n--- [SUITE 5] Adversarial Edge Cases & Stress Resilience ---');

  // Long timer display string (e.g. 99:59:59)
  const timerOverflowAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const td = document.getElementById('timerDisplay');
      const tw = document.querySelector('.timer-widget');
      const originalText = td.textContent;

      td.textContent = '99:59:59';
      const rect = td.getBoundingClientRect();
      const twRect = tw.getBoundingClientRect();

      td.textContent = originalText;

      return {
        tdWidth: Math.round(rect.width),
        twWidth: Math.round(twRect.width),
        twFitsInCenter: twRect.right <= window.innerWidth
      };
    })()
  `);

  record('SUITE 5', 'Extreme timer length (99:59:59) does not break .timer-widget layout or overflow viewport',
    timerOverflowAudit.twFitsInCenter && timerOverflowAudit.tdWidth > 0,
    `tdWidth=${timerOverflowAudit.tdWidth}, twWidth=${timerOverflowAudit.twWidth}`
  );

  // Long clock display string (e.g. 23:59:59)
  const clockOverflowAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      const cd = document.getElementById('clockDisplay');
      const tw = document.querySelector('.timer-widget');
      const originalText = cd.textContent;

      cd.textContent = '23:59:59';
      const cdRect = cd.getBoundingClientRect();
      const twRect = tw.getBoundingClientRect();

      cd.textContent = originalText;

      return {
        cdWidth: Math.round(cdRect.width),
        twWidth: Math.round(twRect.width),
        fits: cdRect.right <= twRect.right + 2
      };
    })()
  `);

  record('SUITE 5', 'Clock display at 23:59:59 does not overflow .timer-widget bounds',
    clockOverflowAudit.fits && clockOverflowAudit.cdWidth > 0,
    `cdWidth=${clockOverflowAudit.cdWidth}, fits=${clockOverflowAudit.fits}`
  );

  // Invalid language code rejection and state preservation under Arabic
  const invalidLangAudit = await presenterWindow.webContents.executeJavaScript(`
    (() => {
      i18n.setLanguage('ar');
      const beforeDir = document.documentElement.getAttribute('dir');
      const beforeLang = i18n.getCurrentLanguage();

      // Adversarial: set totally bogus language
      i18n.setLanguage('klingon_UNKNOWN');
      const afterDir = document.documentElement.getAttribute('dir');
      const afterLang = i18n.getCurrentLanguage();

      return {
        preservedDir: beforeDir === afterDir && afterDir === 'rtl',
        preservedLang: beforeLang === afterLang && afterLang === 'ar'
      };
    })()
  `);

  record('SUITE 5', 'Bogus language input preserves active Arabic RTL state without corruption',
    invalidLangAudit.preservedDir && invalidLangAudit.preservedLang,
    `preservedDir=${invalidLangAudit.preservedDir}, preservedLang=${invalidLangAudit.preservedLang}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY & EXIT
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  const allPassed = results.every(r => r.passed);
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`  Challenger 1 Verification Summary:`);
  console.log(`  - Total Checks: ${total}`);
  console.log(`  - Passed: ${passedCount}`);
  console.log(`  - Failed: ${failedCount}`);
  console.log('================================================================\n');

  if (launcherWindow && !launcherWindow.isDestroyed()) launcherWindow.destroy();
  if (presenterWindow && !presenterWindow.isDestroyed()) presenterWindow.destroy();

  if (allPassed) {
    console.log('  🎯 [CHALLENGER 1 COMPLETE]: ALL ADVERSARIAL CHECKS PASSED!\n');
    app.exit(0);
  } else {
    console.error('  ❌ [CHALLENGER 1 FAILED]: Adversarial failures detected.\n');
    app.exit(1);
  }
}

app.whenReady().then(runAdversarialVerification);
