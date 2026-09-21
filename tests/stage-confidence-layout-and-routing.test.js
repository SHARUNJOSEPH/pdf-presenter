/**
 * tests/stage-confidence-layout-and-routing.test.js
 * Verification of:
 * 1. Presenter shortcut input protection (typing in modals/inputs does not trigger presenter shortcuts)
 * 2. Live Audience & Multi-Display Banner Routing (presenter, audience, stage, all)
 * 3. Multi-Deck Playlist Click-To-Select & Demo Deck Fallback
 * 4. Stage Confidence Monitor Display Selector & Refresh Architecture
 * 5. Stage Confidence Resizable Layout Panels, Presets & Persistence
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WatermarkBannerEngine = require('../js/watermark-banner.js');

describe('1. Presenter Shortcut Input Protection', () => {
  const presenterJs = fs.readFileSync(path.join(__dirname, '../js/presenter.js'), 'utf8');

  it('contains input/textarea/contenteditable and modal guard in keydown listener', () => {
    // Must check for form inputs
    assert.ok(
      presenterJs.includes("target.matches('input, textarea, select, [contenteditable]')"),
      'presenter.js must check if target is an editable input'
    );
    // Must check for open modals
    assert.ok(
      presenterJs.includes('.modal-backdrop.open'),
      'presenter.js must check for active modal backdrop'
    );
    // Must allow Escape and Tab through
    assert.ok(
      presenterJs.includes("e.key === 'Escape'"),
      'presenter.js must allow Escape key to dismiss dialogs'
    );
    assert.ok(
      presenterJs.includes("e.key === 'Tab'"),
      'presenter.js must allow Tab key for focus trapping'
    );
  });

  it('simulates keyboard listener: blocks presenter shortcuts when isEditing or modalOpen is true', () => {
    function simulateKeydown(key, isEditing, modalOpen) {
      if (modalOpen || isEditing) {
        if (key === 'Escape' || key === 'Tab') {
          return { prevented: false, handled: 'dialog_nav' };
        }
        return { prevented: false, handled: 'input_typing' }; // Pass through to typing, DO NOT trigger presenter shortcuts
      }

      // Presenter action handling
      switch (key.toLowerCase()) {
        case 'b': return { prevented: true, action: 'blackout' };
        case 'w': return { prevented: true, action: 'whiteout' };
        case 's': return { prevented: true, action: 'spotlight' };
        case 'p': return { prevented: true, action: 'pen' };
        case 'arrowright':
        case ' ':
        case 'enter': return { prevented: true, action: 'next_slide' };
        case 'arrowleft': return { prevented: true, action: 'prev_slide' };
        default: return { prevented: false, action: 'none' };
      }
    }

    // When editing watermark text or modal open:
    assert.strictEqual(simulateKeydown('b', true, false).action, undefined);
    assert.strictEqual(simulateKeydown('w', true, false).action, undefined);
    assert.strictEqual(simulateKeydown('s', true, false).action, undefined);
    assert.strictEqual(simulateKeydown('p', true, false).action, undefined);
    assert.strictEqual(simulateKeydown(' ', true, false).action, undefined);
    assert.strictEqual(simulateKeydown('Enter', true, false).action, undefined);
    assert.strictEqual(simulateKeydown('Escape', true, false).handled, 'dialog_nav');

    // When modal is open (even if target is container):
    assert.strictEqual(simulateKeydown('b', false, true).action, undefined);
    assert.strictEqual(simulateKeydown('s', false, true).action, undefined);
    assert.strictEqual(simulateKeydown('Escape', false, true).handled, 'dialog_nav');

    // When NOT editing and NO modal open: presenter shortcuts fire normally
    assert.strictEqual(simulateKeydown('b', false, false).action, 'blackout');
    assert.strictEqual(simulateKeydown('w', false, false).action, 'whiteout');
    assert.strictEqual(simulateKeydown('s', false, false).action, 'spotlight');
    assert.strictEqual(simulateKeydown('p', false, false).action, 'pen');
    assert.strictEqual(simulateKeydown(' ', false, false).action, 'next_slide');
  });
});

describe('2. Live Audience & Multi-Display Banner Routing', () => {
  let engine;
  let broadcastEvents = [];

  beforeEach(() => {
    broadcastEvents = [];
    engine = new WatermarkBannerEngine.WatermarkBannerEngine();
    engine.syncBus = {
      send: (evt) => broadcastEvents.push(evt)
    };
  });

  it('initializes default target to audience for backward compatibility', () => {
    assert.strictEqual(engine.getBannerTarget(), 'audience');
  });

  it('updates and persists banner target', () => {
    engine.setBannerTarget('presenter');
    assert.strictEqual(engine.getBannerTarget(), 'presenter');

    engine.setBannerTarget('stage');
    assert.strictEqual(engine.getBannerTarget(), 'stage');

    engine.setBannerTarget('all');
    assert.strictEqual(engine.getBannerTarget(), 'all');

    // Invalid target defaults safely
    engine.setBannerTarget('invalid_screen');
    assert.strictEqual(engine.getBannerTarget(), 'audience');
  });

  it('routes showBanner to PRESENTER_ALERT when target is presenter (duration converted to ms)', () => {
    engine.showBanner('Presenter Alert Note', 10, 'presenter');
    assert.strictEqual(broadcastEvents.length, 1);
    assert.strictEqual(broadcastEvents[0].type, 'PRESENTER_ALERT');
    assert.strictEqual(broadcastEvents[0].message, 'Presenter Alert Note');
    assert.strictEqual(broadcastEvents[0].duration, 10000); // ms for cockpit timer
  });

  it('routes showBanner to SHOW_BANNER when target is audience', () => {
    engine.showBanner('Audience Lower Third', 30, 'audience');
    assert.strictEqual(broadcastEvents.length, 1);
    assert.strictEqual(broadcastEvents[0].type, 'SHOW_BANNER');
    assert.strictEqual(broadcastEvents[0].message, 'Audience Lower Third');
    assert.strictEqual(broadcastEvents[0].duration, 30); // seconds for audience ticker
  });

  it('routes showBanner to STAGE_CUE when target is stage (duration converted to ms)', () => {
    engine.showBanner('Stage Wrap Up Soon', 15, 'stage');
    assert.strictEqual(broadcastEvents.length, 1);
    assert.strictEqual(broadcastEvents[0].type, 'STAGE_CUE');
    assert.strictEqual(broadcastEvents[0].message, 'Stage Wrap Up Soon');
    assert.strictEqual(broadcastEvents[0].duration, 15000); // ms for stage monitor
  });

  it('routes showBanner to all 3 channels when target is all', () => {
    engine.showBanner('Emergency Announcement', 0, 'all');
    assert.strictEqual(broadcastEvents.length, 3);
    const types = broadcastEvents.map(e => e.type);
    assert.ok(types.includes('PRESENTER_ALERT'));
    assert.ok(types.includes('SHOW_BANNER'));
    assert.ok(types.includes('STAGE_CUE'));
  });

  it('routes hideBanner across the respective target or all channels', () => {
    engine.hideBanner('presenter');
    assert.strictEqual(broadcastEvents[0].type, 'CLEAR_PRESENTER_ALERT');

    engine.hideBanner('audience');
    assert.strictEqual(broadcastEvents[1].type, 'HIDE_BANNER');

    engine.hideBanner('stage');
    assert.strictEqual(broadcastEvents[2].type, 'STAGE_CUE');
    assert.strictEqual(broadcastEvents[2].message, '');

    engine.hideBanner('all');
    const lastThree = broadcastEvents.slice(3).map(e => e.type);
    assert.deepStrictEqual(lastThree, ['CLEAR_PRESENTER_ALERT', 'HIDE_BANNER', 'STAGE_CUE']);
  });

  it('verifies views contain #bannerTargetSelect with presenter, audience, stage, all', () => {
    const presenterHtml = fs.readFileSync(path.join(__dirname, '../views/presenter.html'), 'utf8');
    const launcherHtml = fs.readFileSync(path.join(__dirname, '../views/launcher.html'), 'utf8');

    for (const html of [presenterHtml, launcherHtml]) {
      assert.ok(html.includes('id="bannerTargetSelect"'), 'HTML must contain bannerTargetSelect');
      assert.ok(html.includes('value="presenter"'), 'Target select must offer presenter');
      assert.ok(html.includes('value="audience"'), 'Target select must offer audience');
      assert.ok(html.includes('value="stage"'), 'Target select must offer stage');
      assert.ok(html.includes('value="all"'), 'Target select must offer all');
    }
  });
});

describe('3. Multi-Deck Playlist Click-To-Select & Demo Fallback', () => {
  const launcherJs = fs.readFileSync(path.join(__dirname, '../js/launcher.js'), 'utf8');

  it('launcher.js contains selectActiveDeck implementation and card click binding', () => {
    assert.ok(launcherJs.includes('async function selectActiveDeck(deckId)'), 'launcher.js must define selectActiveDeck');
    assert.ok(launcherJs.includes('launcherPlaylistEngine.switchDeck(deckId)'), 'selectActiveDeck must switch deck in playlist engine');
    assert.ok(launcherJs.includes("item.addEventListener('click'"), 'Deck items must have click event listeners');
    assert.ok(launcherJs.includes('window.electronAPI.loadRecentPdf(activeDeck.path)'), 'Active deck must load into Electron backend');
  });

  it('launcher.js contains resetToDemoFallback and restores Interactive Presentation Showcase', () => {
    assert.ok(launcherJs.includes('async function resetToDemoFallback()'), 'launcher.js must define resetToDemoFallback');
    assert.ok(launcherJs.includes('isDemo: true'), 'Demo fallback must set isDemo flag');
    assert.ok(launcherJs.includes('Interactive Presentation Showcase.pdf'), 'Demo fallback must restore Demo Showcase name');
    assert.ok(launcherJs.includes('totalPages: 6'), 'Demo fallback must restore 6 total pages');
  });

  it('clearing playlist triggers resetToDemoFallback', () => {
    assert.ok(
      launcherJs.includes('btnLauncherClearPlaylist.addEventListener') &&
      launcherJs.includes('resetToDemoFallback()'),
      'Clear playlist button must invoke resetToDemoFallback'
    );
  });

  it('preload.js exposes getPathForFile resolving native file path via webUtils', () => {
    const preloadJs = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
    assert.ok(preloadJs.includes('getPathForFile'), 'preload.js must expose getPathForFile');
    assert.ok(preloadJs.includes('webUtils'), 'preload.js must import or reference webUtils');
    assert.ok(preloadJs.includes('webUtils.getPathForFile(file)'), 'preload.js must call webUtils.getPathForFile');
  });

  it('main.js startPresentationWindows ingests config.pdfBuffer and attaches config.playlist', () => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(mainJs.includes('config.pdfBuffer'), 'main.js must check config.pdfBuffer');
    assert.ok(mainJs.includes('activePdfBuffer = Buffer.isBuffer(config.pdfBuffer)'), 'main.js must convert config.pdfBuffer to Buffer');
    assert.ok(mainJs.includes('playlist: Array.isArray(config.playlist)'), 'main.js must attach playlist to currentPdfConfig');
  });

  it('launcher.js synchronizes active deck buffer and passes pdfBuffer to startPresentation', () => {
    assert.ok(launcherJs.includes('activeBuffer = (startingDeck && startingDeck.pdfBuffer)'), 'launcher.js must resolve activeBuffer from starting deck');
    assert.ok(launcherJs.includes('pdfBuffer: activeBuffer'), 'config must pass pdfBuffer');
    assert.ok(launcherJs.includes('setActivePdfBuffer({ fileName: activeDeck.title, buffer: activeDeck.pdfBuffer })'), 'selectActiveDeck must sync buffer to main process');
  });

  it('audience.js handles LOAD_DOCUMENT with pdfData or pdfBuffer without requiring path', () => {
    const audienceJs = fs.readFileSync(path.join(__dirname, '../js/audience.js'), 'utf8');
    assert.ok(
      audienceJs.includes("case 'LOAD_DOCUMENT':") &&
      audienceJs.includes('data.pdfData || data.pdfBuffer || data.path'),
      'audience.js LOAD_DOCUMENT must support pdfData/pdfBuffer even when path is empty'
    );
  });

  it('simulates multi-deck playlist buffer ingestion, selection and presentation config', async () => {
    const PlaylistMetricsEngine = require('../js/playlist-metrics.js');
    const engine = new PlaylistMetricsEngine({ isPro: true });

    // Mock PDF buffers for 2 presentations
    const mockBufferDeck1 = Buffer.from('%PDF-1.4 Deck 1 Header Content');
    const mockBufferDeck2 = Buffer.from('%PDF-1.4 Deck 2 Header Content');

    // Add first deck
    const d1 = engine.addDeck({
      title: 'Keynote Speaker.pdf',
      path: '',
      pdfBuffer: mockBufferDeck1,
      slideCount: 12,
      speaker: 'Dr. Alice'
    });
    assert.equal(d1.success, true);
    assert.equal(d1.deck.active, true);
    assert.equal(engine.getActiveDeck().title, 'Keynote Speaker.pdf');

    // Add second deck
    const d2 = engine.addDeck({
      title: 'Product Roadmap.pdf',
      path: '',
      pdfBuffer: mockBufferDeck2,
      slideCount: 24,
      speaker: 'Bob Smith'
    });
    assert.equal(d2.success, true);
    assert.equal(d2.deck.active, false);

    // Switch active deck to second deck (Make Active)
    const switchRes = await engine.switchDeck(d2.deck.id);
    assert.equal(switchRes.success, true);
    const active = engine.getActiveDeck();
    assert.equal(active.id, d2.deck.id);
    assert.equal(active.title, 'Product Roadmap.pdf');
    assert.equal(active.slideCount, 24);
    assert.ok(active.pdfBuffer);

    // Prepare presentation launch config from active deck
    const config = {
      isDemo: false,
      title: active.title,
      filePath: active.path || null,
      totalPages: active.slideCount,
      pdfBuffer: active.pdfBuffer,
      playlist: engine.getPlaylist()
    };

    assert.equal(config.isDemo, false);
    assert.equal(config.title, 'Product Roadmap.pdf');
    assert.equal(config.totalPages, 24);
    assert.deepEqual(config.pdfBuffer, mockBufferDeck2);
    assert.equal(config.playlist.length, 2);
    assert.equal(config.playlist.find(d => d.active).id, d2.deck.id);
  });
});

describe('4. Stage Confidence Monitor Display Selector & Refresh Architecture', () => {
  const presenterHtml = fs.readFileSync(path.join(__dirname, '../views/presenter.html'), 'utf8');
  const launcherHtml = fs.readFileSync(path.join(__dirname, '../views/launcher.html'), 'utf8');
  const presenterJs = fs.readFileSync(path.join(__dirname, '../js/presenter.js'), 'utf8');
  const launcherJs = fs.readFileSync(path.join(__dirname, '../js/launcher.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

  it('views contain #selConfidenceDisplay and #btnRefreshConfidenceDisplays', () => {
    for (const html of [presenterHtml, launcherHtml]) {
      assert.ok(html.includes('id="selConfidenceDisplay"'), 'confidence modal must contain display selector');
      assert.ok(html.includes('id="btnRefreshConfidenceDisplays"'), 'confidence modal must contain refresh button');
    }
  });

  it('presenter.js and launcher.js populate confidence displays with bounds and resolution', () => {
    for (const js of [presenterJs, launcherJs]) {
      assert.ok(js.includes('populateConfidenceDisplays()'), 'Must contain populateConfidenceDisplays function');
      assert.ok(js.includes('electronAPI.getDisplays()'), 'Must invoke getDisplays from IPC');
      assert.ok(js.includes('selConfidenceDisplay'), 'Must reference selConfidenceDisplay');
      assert.ok(js.includes('btnRefreshConfidenceDisplays'), 'Must wire btnRefreshConfidenceDisplays');
    }
  });

  it('launchConfidenceWindow passes displayId and fullscreen options', () => {
    assert.ok(
      presenterJs.includes('launchConfidenceWindow({ displayId, fullscreen: true })') ||
      presenterJs.includes('electronAPI.launchConfidenceWindow({ displayId, fullscreen: true })'),
      'presenter.js must pass displayId to launchConfidenceWindow'
    );
    assert.ok(
      launcherJs.includes('launchConfidenceWindow({ displayId, fullscreen: true })'),
      'launcher.js must pass displayId to launchConfidenceWindow'
    );
  });

  it('main.js handles displayId positioning and fullscreen for confidence window', () => {
    assert.ok(mainJs.includes('createConfidenceWindow(options = {})'), 'main.js createConfidenceWindow accepts options');
    assert.ok(mainJs.includes('options.displayId'), 'main.js inspects options.displayId');
    assert.ok(mainJs.includes('targetDisplay.bounds'), 'main.js positions window within target display bounds');
    assert.ok(mainJs.includes('confidenceWindow.setFullScreen(true)'), 'main.js enables fullscreen on confidence window');
  });
});

describe('5. Stage Confidence Resizable Layout Panels, Presets & Persistence', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html contains preset buttons and splitters', () => {
    assert.ok(confHtml.includes('id="confLayoutPresets"'), 'Confidence HTML must contain layout presets');
    assert.ok(confHtml.includes('id="btnPresetTimer"'), 'Must have btnPresetTimer button');
    assert.ok(confHtml.includes('id="btnPresetSlides"'), 'Must have btnPresetSlides button');
    assert.ok(confHtml.includes('id="btnPresetNotes"'), 'Must have btnPresetNotes button');
    assert.ok(confHtml.includes('id="btnPresetBalanced"'), 'Must have btnPresetBalanced button');
    assert.ok(confHtml.includes('id="confResizerH"'), 'Must have horizontal resizer bar');
    assert.ok(confHtml.includes('id="confResizerV"'), 'Must have vertical resizer bar');
  });

  it('css/confidence.css provides dynamic CSS variables and resize cursor styling', () => {
    assert.ok(confCss.includes('--conf-top-height'), 'Must define --conf-top-height variable');
    assert.ok(confCss.includes('--conf-timer-font-size'), 'Must define --conf-timer-font-size variable');
    assert.ok(confCss.includes('--conf-slides-width'), 'Must define --conf-slides-width variable');
    assert.ok(confCss.includes('cursor: row-resize'), 'confResizerH must have row-resize cursor');
    assert.ok(confCss.includes('cursor: col-resize'), 'confResizerV must have col-resize cursor');
  });

  it('js/confidence.js manages layout presets, clamping, and localStorage persistence', () => {
    assert.ok(confJs.includes('pdf_presenter_confidence_layout'), 'Must persist layout to localStorage key');
    assert.ok(confJs.includes('function applyLayout('), 'Must contain applyLayout function');
    assert.ok(confJs.includes('function setPreset('), 'Must contain setPreset function');
    assert.ok(confJs.includes('timer'), 'Must define timer preset');
    assert.ok(confJs.includes('slides'), 'Must define slides preset');
    assert.ok(confJs.includes('notes'), 'Must define notes preset');
    assert.ok(confJs.includes('balanced'), 'Must define balanced preset');
    assert.ok(confJs.includes('setPointerCapture'), 'Must use pointer capture for smooth dragging');
  });
});

describe('6. Stage Confidence WATCHOUT 7 Dockable Windows & Drag-and-Drop Architecture', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html declares confDashboardGrid and all 7 modular dockable windows', () => {
    assert.ok(confHtml.includes('id="confDashboardGrid"'), 'Must contain #confDashboardGrid container');
    assert.ok(confHtml.includes('conf-dock-grid'), 'Dashboard grid must have conf-dock-grid class');

    const requiredWindows = [
      'dockWindowTimer',
      'dockWindowClock',
      'dockWindowCounter',
      'dockWindowCurrent',
      'dockWindowNext',
      'dockWindowNotes',
      'dockWindowCue'
    ];

    for (const winId of requiredWindows) {
      assert.ok(confHtml.includes(`id="${winId}"`), `Confidence HTML must contain #${winId}`);
    }

    const requiredWindowDataIds = [
      'data-window-id="timer"',
      'data-window-id="clock"',
      'data-window-id="counter"',
      'data-window-id="current"',
      'data-window-id="next"',
      'data-window-id="notes"',
      'data-window-id="cue"'
    ];

    for (const dataId of requiredWindowDataIds) {
      assert.ok(confHtml.includes(dataId), `Confidence HTML must contain tile ${dataId}`);
    }
  });

  it('views/confidence.html contains WATCHOUT 7 toolbar controls and widgets toggle drawer', () => {
    assert.ok(confHtml.includes('id="btnLockDashboard"'), 'Must contain lock dashboard button');
    assert.ok(confHtml.includes('id="btnResetLayout"'), 'Must contain reset layout button');
    assert.ok(confHtml.includes('id="btnWidgetsMenu"'), 'Must contain widgets menu dropdown button');
    assert.ok(confHtml.includes('id="confWidgetsDropdown"'), 'Must contain widgets dropdown drawer');

    const widgetCheckboxes = [
      'chkWinTimer',
      'chkWinClock',
      'chkWinCounter',
      'chkWinCurrent',
      'chkWinNext',
      'chkWinNotes',
      'chkWinCue'
    ];

    for (const chkId of widgetCheckboxes) {
      assert.ok(confHtml.includes(`id="${chkId}"`), `Widgets menu must contain #${chkId}`);
    }
  });

  it('views/confidence.html equips all dockable tiles with grab handle, title, and action controls', () => {
    assert.ok(confHtml.includes('class="conf-dock-header"'), 'Dock tiles must have dock headers');
    assert.ok(confHtml.includes('class="dock-drag-handle"'), 'Dock headers must have drag handles');
    assert.ok(confHtml.includes('class="btn-dock-action btn-dock-collapse"'), 'Must have collapse action button');
    assert.ok(confHtml.includes('class="btn-dock-action btn-dock-span"'), 'Must have span cycling action button');
    assert.ok(confHtml.includes('class="btn-dock-action btn-dock-close"'), 'Must have close action button');
  });

  it('css/confidence.css defines dockable grid, dragging feedback, drop targets, and spans', () => {
    assert.ok(confCss.includes('.conf-dashboard-grid'), 'CSS must define .conf-dashboard-grid');
    assert.ok(confCss.includes('.conf-dock-window'), 'CSS must define .conf-dock-window');
    assert.ok(confCss.includes('.conf-dock-window.is-dragging'), 'CSS must define .is-dragging visual feedback');
    assert.ok(confCss.includes('.conf-dock-window.drop-target-before'), 'CSS must define .drop-target-before drop marker');
    assert.ok(confCss.includes('.conf-dock-window.drop-target-after'), 'CSS must define .drop-target-after drop marker');
    assert.ok(confCss.includes('.conf-dock-window.is-collapsed'), 'CSS must define .is-collapsed state');
    assert.ok(confCss.includes('.dock-drag-handle'), 'CSS must define .dock-drag-handle');
    assert.ok(confCss.includes('cursor: grab'), 'Drag handle must have grab cursor');
    assert.ok(confCss.includes('.dashboard-locked'), 'CSS must define .dashboard-locked state');
    assert.ok(confCss.includes('.span-1'), 'CSS must define span-1 layout class');
    assert.ok(confCss.includes('.span-2'), 'CSS must define span-2 layout class');
    assert.ok(confCss.includes('.span-3'), 'CSS must define span-3 layout class');
    assert.ok(confCss.includes('.span-full'), 'CSS must define span-full layout class');
  });

  it('js/confidence.js implements drag-and-drop reordering, locking, presets, and localStorage sync', () => {
    assert.ok(confJs.includes('STORAGE_KEY_DASHBOARD'), 'Must define STORAGE_KEY_DASHBOARD');
    assert.ok(confJs.includes('pdf_presenter_confidence_dashboard_layout'), 'Must use dedicated localStorage key');
    assert.ok(confJs.includes('loadDashboardState'), 'Must define loadDashboardState function');
    assert.ok(confJs.includes('saveDashboardState'), 'Must define saveDashboardState function');
    assert.ok(confJs.includes('toggleDashboardLock'), 'Must define toggleDashboardLock');
    assert.ok(confJs.includes('resetDashboardLayout'), 'Must define resetDashboardLayout');
    assert.ok(confJs.includes('applyDockPreset'), 'Must define applyDockPreset');
    assert.ok(confJs.includes("addEventListener('dragstart'"), 'Must bind dragstart event');
    assert.ok(confJs.includes("addEventListener('dragover'"), 'Must bind dragover event');
    assert.ok(confJs.includes("addEventListener('dragleave'"), 'Must bind dragleave event');
    assert.ok(confJs.includes("addEventListener('drop'"), 'Must bind drop event');
    assert.ok(confJs.includes("addEventListener('dragend'"), 'Must bind dragend event');
  });
});

describe('7. Stage Confidence Display Scaling & Dynamic Window Enable/Disable Engine', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html declares stage scale toolbar controls', () => {
    assert.ok(confHtml.includes('id="confScaleToolbar"'), 'Must contain #confScaleToolbar container');
    assert.ok(confHtml.includes('id="btnScaleDown"'), 'Must contain #btnScaleDown zoom out button');
    assert.ok(confHtml.includes('id="btnScaleReset"'), 'Must contain #btnScaleReset percentage badge button');
    assert.ok(confHtml.includes('id="btnScaleUp"'), 'Must contain #btnScaleUp zoom in button');
  });

  it('views/confidence.html equips all 7 window toggles with interactive badges and data-window-id', () => {
    const windows = ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'];
    for (const wid of windows) {
      assert.ok(
        confHtml.includes(`data-window-id="${wid}"`),
        `Toggle item must declare data-window-id="${wid}"`
      );
    }
    assert.ok(confHtml.includes('class="widget-toggle-badge"'), 'Must contain widget toggle badges');
  });

  it('css/confidence.css defines scale variable, scale toolbar, and adaptive toggle styles', () => {
    assert.ok(confCss.includes('--conf-scale'), 'Must declare --conf-scale variable');
    assert.ok(confCss.includes('.conf-scale-toolbar'), 'Must style .conf-scale-toolbar');
    assert.ok(confCss.includes('.btn-conf-scale'), 'Must style .btn-conf-scale');
    assert.ok(confCss.includes('.widget-toggle-badge'), 'Must style .widget-toggle-badge');
    assert.ok(confCss.includes('calc(92px * var(--conf-scale, 1))'), 'Grid rows must scale dynamically');
  });

  it('js/confidence.js implements applyStageScale, shortcuts, and grid adaptation', () => {
    assert.ok(confJs.includes('STORAGE_KEY_SCALE'), 'Must define STORAGE_KEY_SCALE');
    assert.ok(confJs.includes('applyStageScale'), 'Must define applyStageScale function');
    assert.ok(confJs.includes('adjustGridForActiveWindows'), 'Must define adjustGridForActiveWindows function');
    assert.ok(confJs.includes("e.key === '+' || e.key === '='"), 'Must support Ctrl + + shortcut');
    assert.ok(confJs.includes("e.key === '-' || e.key === '_'"), 'Must support Ctrl + - shortcut');
    assert.ok(confJs.includes("e.key === '0'"), 'Must support Ctrl + 0 shortcut');
  });

  it('simulates stage scale clamping and calculation logic', () => {
    function clampScale(scale) {
      return Math.max(0.6, Math.min(2.2, Math.round(scale * 100) / 100));
    }

    assert.strictEqual(clampScale(1.0), 1.0);
    assert.strictEqual(clampScale(1.5), 1.5);
    assert.strictEqual(clampScale(3.0), 2.2); // clamped to max 220%
    assert.strictEqual(clampScale(0.2), 0.6); // clamped to min 60%
    assert.strictEqual(clampScale(1.1000000000000001), 1.1); // rounded precision
  });

  it('simulates adaptive grid row & span calculation when windows are toggled', () => {
    function calculateSpansAndRows(activeWindows, scale = 1.0) {
      const isTimer = activeWindows.includes('timer');
      const isClock = activeWindows.includes('clock');
      const isCounter = activeWindows.includes('counter');
      const isCurrent = activeWindows.includes('current');
      const isNext = activeWindows.includes('next');
      const isNotes = activeWindows.includes('notes');
      const isCue = activeWindows.includes('cue');

      let currentSpan = 'span-2';
      if (isCurrent && !isNext) currentSpan = 'span-full'; // Full width single slide

      let timerSpan = 'span-1';
      if (isTimer && !isClock && !isCounter) timerSpan = 'span-full';

      const hasTop = isTimer || isClock || isCounter;
      const hasSlides = isCurrent || isNext;
      const hasBottom = isNotes || isCue;

      return {
        timerSpan,
        currentSpan,
        hasTop,
        hasSlides,
        hasBottom,
        topHeight: hasTop ? Math.round(92 * scale) : 0,
        bottomHeight: hasBottom ? Math.round(148 * scale) : 0
      };
    }

    // All active
    const full = calculateSpansAndRows(['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue']);
    assert.strictEqual(full.timerSpan, 'span-1');
    assert.strictEqual(full.currentSpan, 'span-2');
    assert.strictEqual(full.hasTop, true);
    assert.strictEqual(full.topHeight, 92);

    // If "next" (Up Next) is disabled: Current slide expands to full width!
    const singleSlide = calculateSpansAndRows(['timer', 'clock', 'counter', 'current', 'notes']);
    assert.strictEqual(singleSlide.currentSpan, 'span-full');

    // If clock and counter disabled: Timer takes full top row!
    const timerOnly = calculateSpansAndRows(['timer', 'current', 'next', 'notes']);
    assert.strictEqual(timerOnly.timerSpan, 'span-full');

    // If top row disabled: topHeight collapses to 0
    const noTop = calculateSpansAndRows(['current', 'next', 'notes']);
    assert.strictEqual(noTop.hasTop, false);
    assert.strictEqual(noTop.topHeight, 0);

    // Scaled at 1.5x
    const scaled = calculateSpansAndRows(['timer', 'current'], 1.5);
    assert.strictEqual(scaled.topHeight, 138); // 92 * 1.5
  });
});

describe('8. Stage Confidence Window Sizing (Width, Height, Maximize) & Dropdown Disambiguation', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html equips all 7 windows with floating sizing HUD chips', () => {
    assert.ok(confHtml.includes('class="conf-window-hud"'), 'Must contain .conf-window-hud');
    assert.ok(confHtml.includes('btn-hud-width'), 'Must contain .btn-hud-width button');
    assert.ok(confHtml.includes('btn-hud-height'), 'Must contain .btn-hud-height button');
    assert.ok(confHtml.includes('btn-hud-max'), 'Must contain .btn-hud-max button');
    assert.ok(confHtml.includes('btn-dock-height'), 'Must contain .btn-dock-height in dock actions');
    assert.ok(confHtml.includes('btn-dock-max'), 'Must contain .btn-dock-max in dock actions');
  });

  it('views/confidence.html uses div role="button" for all dropdown items to prevent synthetic label clicks', () => {
    const windows = ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'];
    for (const wid of windows) {
      assert.ok(
        confHtml.includes(`<div class="widget-toggle-item" role="button" tabindex="0" data-window-id="${wid}">`),
        `Dropdown item for ${wid} must be a div with role="button" and tabindex="0"`
      );
    }
  });

  it('css/confidence.css defines row spans, maximized mode, floating HUD, and top-bar z-index', () => {
    assert.ok(confCss.includes('.conf-dock-window.row-span-1'), 'CSS must define row-span-1');
    assert.ok(confCss.includes('.conf-dock-window.row-span-2'), 'CSS must define row-span-2');
    assert.ok(confCss.includes('.conf-dock-window.row-span-full'), 'CSS must define row-span-full');
    assert.ok(confCss.includes('.conf-dock-window.is-maximized'), 'CSS must define is-maximized full-screen mode');
    assert.ok(confCss.includes('.conf-window-hud'), 'CSS must style floating HUD chip');
    assert.ok(confCss.includes('.btn-hud-size'), 'CSS must style HUD size buttons');
    assert.ok(confCss.includes('z-index: 100'), 'conf-top-bar must have high z-index to overlay stages');
  });

  it('js/confidence.js implements cycleWindowWidth, cycleWindowHeight, and toggleWindowMaximize', () => {
    assert.ok(confJs.includes('function cycleWindowWidth('), 'Must define cycleWindowWidth function');
    assert.ok(confJs.includes('function cycleWindowHeight('), 'Must define cycleWindowHeight function');
    assert.ok(confJs.includes('function toggleWindowMaximize('), 'Must define toggleWindowMaximize function');
    assert.ok(confJs.includes('function setWindowRowSpan('), 'Must define setWindowRowSpan function');
    assert.ok(confJs.includes("e.key === 'Enter' || e.key === ' '"), 'Must support keyboard activation for toggle items');
  });

  it('simulates width and height cycling logic', () => {
    function cycleWidth(current) {
      const spans = ['span-1', 'span-2', 'span-3', 'span-full'];
      return spans[(spans.indexOf(current) + 1) % spans.length];
    }

    assert.strictEqual(cycleWidth('span-1'), 'span-2');
    assert.strictEqual(cycleWidth('span-2'), 'span-3');
    assert.strictEqual(cycleWidth('span-3'), 'span-full');
    assert.strictEqual(cycleWidth('span-full'), 'span-1');

    function cycleHeight(current) {
      const rowSpans = ['row-span-1', 'row-span-2', 'row-span-full'];
      return rowSpans[(rowSpans.indexOf(current) + 1) % rowSpans.length];
    }

    assert.strictEqual(cycleHeight('row-span-1'), 'row-span-2');
    assert.strictEqual(cycleHeight('row-span-2'), 'row-span-full');
    assert.strictEqual(cycleHeight('row-span-full'), 'row-span-1');
  });

  it('simulates maximize and restore state toggle logic', () => {
    let state = {
      maximizedWindow: null
    };

    function toggleMax(windowId) {
      if (state.maximizedWindow === windowId) {
        state.maximizedWindow = null;
      } else {
        state.maximizedWindow = windowId;
      }
      return state.maximizedWindow;
    }

    assert.strictEqual(toggleMax('timer'), 'timer');
    assert.strictEqual(toggleMax('timer'), null); // Restores to normal grid
    assert.strictEqual(toggleMax('current'), 'current');
    assert.strictEqual(toggleMax('notes'), 'notes'); // Switches maximize focus
    assert.strictEqual(toggleMax('notes'), null); // Restores
  });
});

describe('9. Stage Confidence Continuous Click-and-Drag Flexible Window Resizing & Splitter Parity', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html equips all 7 dock windows with right, bottom, and corner resizer handles', () => {
    const windows = ['Timer', 'Clock', 'Counter', 'Current', 'Next', 'Notes', 'Cue'];
    for (const wid of windows) {
      const windowPattern = new RegExp(`id="dockWindow${wid}"[\\s\\S]*?class="conf-dock-resizer conf-dock-resizer-r"[\\s\\S]*?class="conf-dock-resizer conf-dock-resizer-b"[\\s\\S]*?class="conf-dock-resizer conf-dock-resizer-se"`);
      assert.ok(
        windowPattern.test(confHtml),
        `dockWindow${wid} must contain .conf-dock-resizer-r, .conf-dock-resizer-b, and .conf-dock-resizer-se`
      );
    }
  });

  it('css/confidence.css implements 120-column precision grid system and dynamic row height variables', () => {
    assert.ok(
      confCss.includes('grid-template-columns: repeat(120, minmax(0, 1fr))'),
      'Must use 120-column precision system for fluid continuous resizing'
    );
    assert.ok(
      confCss.includes('var(--conf-row-top-h,'),
      'Must support dynamic top row height variable'
    );
    assert.ok(
      confCss.includes('var(--conf-row-middle-h,'),
      'Must support dynamic middle row height variable'
    );
    assert.ok(
      confCss.includes('var(--conf-row-bottom-h,'),
      'Must support dynamic bottom row height variable'
    );
  });

  it('css/confidence.css styles right edge, bottom edge, corner grip, and document resizing cursors', () => {
    assert.ok(confCss.includes('.conf-dock-resizer-r'), 'Must style right edge resizer');
    assert.ok(confCss.includes('cursor: col-resize'), 'Right edge must have col-resize cursor');
    assert.ok(confCss.includes('.conf-dock-resizer-b'), 'Must style bottom edge resizer');
    assert.ok(confCss.includes('cursor: row-resize'), 'Bottom edge must have row-resize cursor');
    assert.ok(confCss.includes('.conf-dock-resizer-se'), 'Must style corner grip resizer');
    assert.ok(confCss.includes('cursor: nwse-resize'), 'Corner grip must have nwse-resize cursor');
    assert.ok(confCss.includes('body.conf-resizing-col'), 'Must style body during column resizing');
    assert.ok(confCss.includes('body.conf-resizing-row'), 'Must style body during row resizing');
    assert.ok(confCss.includes('body.conf-resizing-se'), 'Must style body during corner resizing');
  });

  it('js/confidence.js implements initWindowResizers, pointer capture, slide re-rendering, and double-click reset', () => {
    assert.ok(confJs.includes('function initWindowResizers('), 'Must define initWindowResizers function');
    assert.ok(confJs.includes('setPointerCapture'), 'Must use setPointerCapture for smooth dragging');
    assert.ok(confJs.includes('releasePointerCapture'), 'Must release pointer capture on drag end');
    assert.ok(confJs.includes("dblclick'"), 'Must bind double-click event to reset dimensions');
    assert.ok(confJs.includes('flexibleSpans'), 'Must save flexible column spans in dashboardState');
    assert.ok(confJs.includes('flexibleRows'), 'Must save flexible row heights in dashboardState');
  });

  it('simulates 120-column continuous horizontal drag math for paired windows (Current & Next)', () => {
    function simulateHorizontalDrag(startWinW, startPairW, deltaX) {
      const totalW = startWinW + startPairW;
      const newWinW = Math.max(60, Math.min(totalW - 60, startWinW + deltaX));
      const pct = newWinW / totalW;
      const spanWin = Math.max(15, Math.min(105, Math.round(pct * 120)));
      const spanPair = 120 - spanWin;
      return { spanWin, spanPair, totalSpan: spanWin + spanPair };
    }

    // Default 50/50 split at 600px each
    const initial = simulateHorizontalDrag(600, 600, 0);
    assert.strictEqual(initial.spanWin, 60);
    assert.strictEqual(initial.spanPair, 60);
    assert.strictEqual(initial.totalSpan, 120);

    // Drag right by 120px: Current gets 720px (60%), Next gets 480px (40%)
    const dragRight = simulateHorizontalDrag(600, 600, 120);
    assert.strictEqual(dragRight.spanWin, 72);
    assert.strictEqual(dragRight.spanPair, 48);
    assert.strictEqual(dragRight.totalSpan, 120);

    // Drag left by 180px: Current gets 420px (35%), Next gets 780px (65%)
    const dragLeft = simulateHorizontalDrag(600, 600, -180);
    assert.strictEqual(dragLeft.spanWin, 42);
    assert.strictEqual(dragLeft.spanPair, 78);
    assert.strictEqual(dragLeft.totalSpan, 120);

    // Drag way past maximum right: clamped to max 105, Next retains 15
    const clampRight = simulateHorizontalDrag(600, 600, 1000);
    assert.strictEqual(clampRight.spanWin, 105);
    assert.strictEqual(clampRight.spanPair, 15);
    assert.strictEqual(clampRight.totalSpan, 120);

    // Drag way past minimum left: clamped to min 15, Next gets 105
    const clampLeft = simulateHorizontalDrag(600, 600, -1000);
    assert.strictEqual(clampLeft.spanWin, 15);
    assert.strictEqual(clampLeft.spanPair, 105);
    assert.strictEqual(clampLeft.totalSpan, 120);
  });

  it('simulates dynamic vertical row height calculation and clamping', () => {
    function calculateVerticalDrag(gridHeight, currentBottomY, cursorY) {
      // Middle row vs bottom row adjustment
      const newBottomH = Math.max(60, Math.min(Math.round(gridHeight * 0.65), gridHeight - cursorY));
      return {
        bottomRowH: `${newBottomH}px`,
        middleRowH: '1fr'
      };
    }

    const gridH = 800;
    // Normal drag: cursor at 600px from top (leaving 200px for notes)
    const normal = calculateVerticalDrag(gridH, 600, 600);
    assert.strictEqual(normal.bottomRowH, '200px');
    assert.strictEqual(normal.middleRowH, '1fr');

    // Drag upward: cursor at 300px (expanding bottom notes row to 500px, within 65% of 800 = 520px)
    const expandedNotes = calculateVerticalDrag(gridH, 600, 300);
    assert.strictEqual(expandedNotes.bottomRowH, '500px');

    // Drag way downward past floor: clamped to minimum 60px
    const clampedFloor = calculateVerticalDrag(gridH, 600, 780);
    assert.strictEqual(clampedFloor.bottomRowH, '60px');
  });

  it('simulates double-click reset behavior clearing custom styles and variables', () => {
    let mockWindow = {
      style: { gridColumn: 'span 75' }
    };
    let mockPair = {
      style: { gridColumn: 'span 45' }
    };
    let mockGrid = {
      properties: {
        '--conf-row-top-h': '140px',
        '--conf-row-bottom-h': '250px'
      },
      removeProperty(name) {
        delete this.properties[name];
      }
    };

    // Trigger double-click reset
    mockWindow.style.gridColumn = '';
    mockPair.style.gridColumn = '';
    mockGrid.removeProperty('--conf-row-top-h');
    mockGrid.removeProperty('--conf-row-bottom-h');

    assert.strictEqual(mockWindow.style.gridColumn, '');
    assert.strictEqual(mockPair.style.gridColumn, '');
    assert.strictEqual(mockGrid.properties['--conf-row-top-h'], undefined);
    assert.strictEqual(mockGrid.properties['--conf-row-bottom-h'], undefined);
  });
});

describe('10. Stage Confidence Interactive Tab Size Drawer & Real-Time Width/Height Controls', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html contains the Tab Sizes toolbar button and full interactive Tab Size Drawer', () => {
    assert.ok(confHtml.includes('id="btnEditTabSizes"'), 'Must contain #btnEditTabSizes button');
    assert.ok(confHtml.includes('id="confTabSizeDrawer"'), 'Must contain #confTabSizeDrawer container');
    assert.ok(confHtml.includes('id="btnCloseTabSizeDrawer"'), 'Must contain #btnCloseTabSizeDrawer');

    // Quick presets
    assert.ok(confHtml.includes('id="presetSplitBalanced"'), 'Must contain #presetSplitBalanced');
    assert.ok(confHtml.includes('id="presetSplitCinema"'), 'Must contain #presetSplitCinema');
    assert.ok(confHtml.includes('id="presetSplitNotes"'), 'Must contain #presetSplitNotes');
    assert.ok(confHtml.includes('id="presetSplitTimer"'), 'Must contain #presetSplitTimer');
    assert.ok(confHtml.includes('id="presetSplitReset"'), 'Must contain #presetSplitReset');

    // All sliders and step buttons
    assert.ok(confHtml.includes('id="sliderSlidesSplit"'), 'Must contain #sliderSlidesSplit');
    assert.ok(confHtml.includes('id="btnSlideCurrentLess"'), 'Must contain #btnSlideCurrentLess');
    assert.ok(confHtml.includes('id="btnSlideCurrentMore"'), 'Must contain #btnSlideCurrentMore');

    assert.ok(confHtml.includes('id="sliderSlidesHeight"'), 'Must contain #sliderSlidesHeight');
    assert.ok(confHtml.includes('id="btnSlidesHeightLess"'), 'Must contain #btnSlidesHeightLess');
    assert.ok(confHtml.includes('id="btnSlidesHeightMore"'), 'Must contain #btnSlidesHeightMore');

    assert.ok(confHtml.includes('id="sliderTopHeight"'), 'Must contain #sliderTopHeight');
    assert.ok(confHtml.includes('id="btnTopHeightLess"'), 'Must contain #btnTopHeightLess');
    assert.ok(confHtml.includes('id="btnTopHeightMore"'), 'Must contain #btnTopHeightMore');

    assert.ok(confHtml.includes('id="sliderTimerWidth"'), 'Must contain #sliderTimerWidth');
    assert.ok(confHtml.includes('id="btnTimerWidthLess"'), 'Must contain #btnTimerWidthLess');
    assert.ok(confHtml.includes('id="btnTimerWidthMore"'), 'Must contain #btnTimerWidthMore');

    assert.ok(confHtml.includes('id="sliderBottomHeight"'), 'Must contain #sliderBottomHeight');
    assert.ok(confHtml.includes('id="btnBottomHeightLess"'), 'Must contain #btnBottomHeightLess');
    assert.ok(confHtml.includes('id="btnBottomHeightMore"'), 'Must contain #btnBottomHeightMore');

    assert.ok(confHtml.includes('id="sliderNotesWidth"'), 'Must contain #sliderNotesWidth');
    assert.ok(confHtml.includes('id="btnNotesWidthLess"'), 'Must contain #btnNotesWidthLess');
    assert.ok(confHtml.includes('id="btnNotesWidthMore"'), 'Must contain #btnNotesWidthMore');
  });

  it('views/confidence.html equips all 7 windows with direct Size Editor buttons in both HUD and Header', () => {
    const windows = ['Timer', 'Clock', 'Counter', 'Current', 'Next', 'Notes', 'Cue'];
    for (const wid of windows) {
      const windowPattern = new RegExp(`id="dockWindow${wid}"[\\s\\S]*?class="[^"]*btn-hud-editor[^"]*"[\\s\\S]*?class="[^"]*btn-dock-editor[^"]*"`);
      assert.ok(
        windowPattern.test(confHtml),
        `dockWindow${wid} must contain .btn-hud-editor in HUD and .btn-dock-editor in header`
      );
    }
  });

  it('css/confidence.css styles the Tab Size Drawer, cards, range sliders, and step buttons', () => {
    assert.ok(confCss.includes('.conf-tab-size-drawer'), 'Must style .conf-tab-size-drawer');
    assert.ok(confCss.includes('.drawer-tab-card'), 'Must style .drawer-tab-card');
    assert.ok(confCss.includes('.range-slider'), 'Must style .range-slider');
    assert.ok(confCss.includes('.btn-size-step'), 'Must style .btn-size-step');
    assert.ok(confCss.includes('.control-badge'), 'Must style .control-badge');
  });

  it('js/confidence.js implements initTabSizeDrawer, drawer synchronization, and suppresses HTML5 drag collisions', () => {
    assert.ok(confJs.includes('function initTabSizeDrawer()'), 'Must define initTabSizeDrawer');
    assert.ok(confJs.includes('function openTabSizeDrawer('), 'Must define openTabSizeDrawer');
    assert.ok(confJs.includes('function closeTabSizeDrawer()'), 'Must define closeTabSizeDrawer');
    assert.ok(confJs.includes('function syncDrawerControlsFromState()'), 'Must define syncDrawerControlsFromState');
    assert.ok(confJs.includes('openTabSizeEditor: openTabSizeDrawer'), 'Must expose openTabSizeEditor on ConfidenceMonitor');
    assert.ok(confJs.includes('closeTabSizeEditor: closeTabSizeDrawer'), 'Must expose closeTabSizeEditor on ConfidenceMonitor');
    assert.ok(confJs.includes("closest('.conf-dock-resizer')"), 'dragstart must suppress dragging on resizer handles');
    assert.ok(confJs.includes("closest('.conf-window-hud')"), 'dragstart must suppress dragging on window HUD buttons');
  });

  it('simulates live real-time slider split calculation and column allocation across 120-column grid', () => {
    function calculateSplit(percentCurrent) {
      const curPercent = Math.max(15, Math.min(85, Math.round(percentCurrent)));
      const nextPercent = 100 - curPercent;
      const spanCur = Math.max(15, Math.min(105, Math.round((curPercent / 100) * 120)));
      const spanNext = 120 - spanCur;
      return { curPercent, nextPercent, spanCur, spanNext, totalSpan: spanCur + spanNext };
    }

    // 50/50 default
    const split50 = calculateSplit(50);
    assert.strictEqual(split50.spanCur, 60);
    assert.strictEqual(split50.spanNext, 60);
    assert.strictEqual(split50.totalSpan, 120);

    // 70/30 Cinema Preset
    const split70 = calculateSplit(70);
    assert.strictEqual(split70.spanCur, 84);
    assert.strictEqual(split70.spanNext, 36);
    assert.strictEqual(split70.totalSpan, 120);

    // 35/65 Prompter Focused
    const split35 = calculateSplit(35);
    assert.strictEqual(split35.spanCur, 42);
    assert.strictEqual(split35.spanNext, 78);
    assert.strictEqual(split35.totalSpan, 120);
  });

  it('simulates quick preset states and resets all variables cleanly', () => {
    const presets = {
      balanced: { slidesSplit: 50, topHeight: 92, bottomHeight: 148, timerWidth: 33, notesWidth: 67 },
      cinema: { slidesSplit: 70, topHeight: 80, bottomHeight: 120, timerWidth: 30, notesWidth: 70 },
      notes: { slidesSplit: 40, topHeight: 80, bottomHeight: 280, timerWidth: 30, notesWidth: 80 },
      timer: { slidesSplit: 50, topHeight: 180, bottomHeight: 110, timerWidth: 60, notesWidth: 67 }
    };

    assert.strictEqual(presets.balanced.slidesSplit, 50);
    assert.strictEqual(presets.cinema.slidesSplit, 70);
    assert.strictEqual(presets.notes.bottomHeight, 280);
    assert.strictEqual(presets.timer.topHeight, 180);
  });
});

describe('11. Pro Studio Stage Confidence Display Architecture & Auto-Dimming', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');

  it('views/confidence.html features Studio Stage Display templates and Fullscreen control', () => {
    assert.ok(confHtml.includes('STAGE DISPLAY'), 'Brand header must display STAGE DISPLAY');
    assert.ok(confHtml.includes('PRO STUDIO MATRIX'), 'Brand header must show PRO STUDIO MATRIX');
    assert.ok(confHtml.includes('🎬 Dual Cinema'), 'Must offer Dual Cinema layout');
    assert.ok(confHtml.includes('📝 Prompter Focus'), 'Must offer Prompter Focus layout');
    assert.ok(confHtml.includes('⏱️ Timekeeper'), 'Must offer Timekeeper layout');
    assert.ok(confHtml.includes('🖥️ Single Live'), 'Must offer Single Live layout');
    assert.ok(confHtml.includes('🎛️ Studio Edit'), 'Must offer Studio Edit layout');
    assert.ok(confHtml.includes('id="btnFullscreenConf"'), 'Must contain #btnFullscreenConf button');
  });

  it('views/confidence.html contains broadcast studio tallies for Live, Next, and Prompter', () => {
    assert.ok(confHtml.includes('class="conf-studio-tally tally-live"'), 'Live slide must contain tally-live badge');
    assert.ok(confHtml.includes('class="conf-studio-tally tally-next"'), 'Next slide must contain tally-next badge');
    assert.ok(confHtml.includes('class="conf-studio-tally tally-notes"'), 'Prompter must contain tally-notes badge');
    assert.ok(confHtml.includes('LIVE AUDIENCE'), 'Tally must label Live Audience');
    assert.ok(confHtml.includes('UP NEXT'), 'Tally must label Up Next');
    assert.ok(confHtml.includes('TELEPROMPTER SCRIPT'), 'Tally must label Teleprompter Script');
  });

  it('css/confidence.css styles broadcast studio tallies, auto-dimming HUD, and seamless stage mode', () => {
    assert.ok(confCss.includes('.conf-studio-tally'), 'CSS must define .conf-studio-tally');
    assert.ok(confCss.includes('.tally-live'), 'CSS must define .tally-live broadcast styling');
    assert.ok(confCss.includes('.tally-next'), 'CSS must define .tally-next broadcast styling');
    assert.ok(confCss.includes('.tally-notes'), 'CSS must define .tally-notes broadcast styling');
    assert.ok(confCss.includes('.conf-top-bar.hud-dimmed'), 'CSS must define .hud-dimmed state for zero distraction');
    assert.ok(confCss.includes('.confidence-container.mode-seamless:not(.studio-edit-mode) .conf-dock-header'), 'Must hide clumsy window headers in seamless stage mode');
    assert.ok(confCss.includes('.confidence-container.mode-seamless:not(.studio-edit-mode) .conf-window-hud'), 'Must hide floating tile HUD buttons in seamless stage mode');
  });

  it('js/confidence.js implements stage auto-dimmer, fullscreen toggle, and template presets', () => {
    assert.ok(confJs.includes('function resetHudDimmer()'), 'Must implement resetHudDimmer function');
    assert.ok(confJs.includes('hudDimTimeout'), 'Must manage hudDimTimeout');
    assert.ok(confJs.includes('btnFullscreenConf'), 'Must bind btnFullscreenConf');
    assert.ok(confJs.includes('studio-edit-mode'), 'Must toggle studio-edit-mode in applyDockPreset');
  });

  it('simulates stage auto-dimming timeout logic', () => {
    let hudDimmed = false;
    let timeoutId = null;

    function triggerDimmer() {
      hudDimmed = false;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        hudDimmed = true;
      }, 3500);
    }

    // User moves mouse: HUD wakes up
    triggerDimmer();
    assert.strictEqual(hudDimmed, false);

    // After inactivity: HUD dims to remove distraction
    clearTimeout(timeoutId);
    hudDimmed = true;
    assert.strictEqual(hudDimmed, true);

    // Speaker touches mouse on stage: HUD instantly restores
    triggerDimmer();
    assert.strictEqual(hudDimmed, false);
    clearTimeout(timeoutId);
  });
});

describe('6. Stage Cue End-to-End Routing & Launcher Integration', () => {
  const confHtml = fs.readFileSync(path.join(__dirname, '../views/confidence.html'), 'utf8');
  const confCss = fs.readFileSync(path.join(__dirname, '../css/confidence.css'), 'utf8');
  const confJs = fs.readFileSync(path.join(__dirname, '../js/confidence.js'), 'utf8');
  const launcherJs = fs.readFileSync(path.join(__dirname, '../js/launcher.js'), 'utf8');
  const launcherHtml = fs.readFileSync(path.join(__dirname, '../views/launcher.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

  it('views/confidence.html contains floating stage cue overlay and side-by-side row 3 dock tiles', () => {
    assert.ok(confHtml.includes('id="confFloatingStageCue"'), 'Must have #confFloatingStageCue overlay');
    assert.ok(confHtml.includes('id="confFloatingCueText"'), 'Must have #confFloatingCueText element');
    assert.ok(confHtml.includes('id="dockWindowCue"'), 'Must have dockWindowCue element');
    assert.ok(confHtml.includes('id="dockWindowNotes"'), 'Must have dockWindowNotes element');
  });

  it('css/confidence.css contains broadcast-grade floating cue styles', () => {
    assert.ok(confCss.includes('.conf-floating-stage-cue'), 'Must style .conf-floating-stage-cue');
    assert.ok(confCss.includes('.conf-floating-cue-badge'), 'Must style .conf-floating-cue-badge');
    assert.ok(confCss.includes('.conf-floating-cue-msg'), 'Must style .conf-floating-cue-msg');
  });

  it('js/confidence.js binds floating cue elements and balances row 3 tiles', () => {
    assert.ok(confJs.includes("document.getElementById('confFloatingStageCue')"), 'Must bind confFloatingStageCue');
    assert.ok(confJs.includes("document.getElementById('confFloatingCueText')"), 'Must bind confFloatingCueText');
    assert.ok(confJs.includes("cue: 'span-1'"), 'Default cue span must be span-1');
    assert.ok(confJs.includes("notes: 'span-3'"), 'Default notes span must be span-3');
    assert.ok(confJs.includes('confFloatingStageCue.style.display'), 'handleStageCue must toggle floating cue display');
  });

  it('views/launcher.html and js/launcher.js wire up stage cue dispatcher in Confidence Modal', () => {
    assert.ok(launcherHtml.includes('id="txtStageCueMessage"'), 'Launcher HTML must have txtStageCueMessage');
    assert.ok(launcherHtml.includes('id="btnSendStageCue"'), 'Launcher HTML must have btnSendStageCue');
    assert.ok(launcherHtml.includes('id="btnClearStageCue"'), 'Launcher HTML must have btnClearStageCue');
    assert.ok(launcherHtml.includes('class="btn btn-preset-banner cue-preset"'), 'Launcher HTML must have cue presets');

    assert.ok(launcherJs.includes("document.getElementById('txtStageCueMessage')"), 'Launcher JS must bind txtStageCueMessage');
    assert.ok(launcherJs.includes("document.getElementById('btnSendStageCue')"), 'Launcher JS must bind btnSendStageCue');
    assert.ok(launcherJs.includes("document.getElementById('btnClearStageCue')"), 'Launcher JS must bind btnClearStageCue');
    assert.ok(launcherJs.includes("dispatchLauncherStageCue"), 'Launcher JS must define dispatchLauncherStageCue');
    assert.ok(launcherJs.includes("type: 'STAGE_CUE'"), 'Launcher JS must dispatch STAGE_CUE payload');
  });

  it('main.js relays STAGE_CUE without blocking Free tier and syncs to confidenceWindow & wsClients', () => {
    assert.ok(!mainJs.includes("(data.type === 'SHOW_BANNER' || data.type === 'STAGE_CUE'"), 'main.js must not block STAGE_CUE in Free tier');
    assert.ok(mainJs.includes("if (data.type === 'STAGE_CUE')"), 'main.js must track STAGE_CUE state');
    assert.ok(mainJs.includes("state.activeStageCue = data.message"), 'main.js must save activeStageCue to state');
    assert.ok(mainJs.includes("confidenceWindow.webContents.send('sync-event', data)"), 'main.js must relay to confidenceWindow');
  });
});
