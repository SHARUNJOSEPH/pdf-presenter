/**
 * tests/launcher-tools.test.js
 * Unit test suite verifying that the Pro Tools dropdown and pre-flight configuration modals
 * are cleanly integrated into the Home Screen launcher.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Home Screen Launcher Pro Tools Dropdown & Pre-Flight Modals', () => {
  const launcherHtmlPath = path.join(__dirname, '../views/launcher.html');
  const launcherJsPath = path.join(__dirname, '../js/launcher.js');
  const commonCssPath = path.join(__dirname, '../css/common.css');

  const launcherHtml = fs.readFileSync(launcherHtmlPath, 'utf8');
  const launcherJs = fs.readFileSync(launcherJsPath, 'utf8');
  const commonCss = fs.readFileSync(commonCssPath, 'utf8');

  it('views/launcher.html contains proToolsDropdownWrapper in the header', () => {
    assert.ok(launcherHtml.includes('id="proToolsDropdownWrapper"'), 'proToolsDropdownWrapper must exist in launcher header');
    assert.ok(launcherHtml.includes('id="btnProToolsMenu"'), 'btnProToolsMenu button must exist');
    assert.ok(launcherHtml.includes('id="proToolsMenuPopover"'), 'proToolsMenuPopover dropdown popover must exist');

    const proContainerIdx = launcherHtml.indexOf('id="proHeaderContainer"');
    const dropdownIdx = launcherHtml.indexOf('id="proToolsDropdownWrapper"');
    const langIdx = launcherHtml.indexOf('class="lang-selector-wrapper"');

    assert.ok(dropdownIdx > proContainerIdx, 'proToolsDropdownWrapper must follow proHeaderContainer');
    assert.ok(dropdownIdx < langIdx, 'proToolsDropdownWrapper must precede lang-selector-wrapper');
  });

  it('views/launcher.html contains the 7 Pro tool buttons in proToolsMenuPopover and Companion API in footer', () => {
    const requiredProButtons = [
      'id="btnWatermark"',
      'id="btnAudienceBanner"',
      'id="btnPlaylist"',
      'id="btnRehearsalMetrics"',
      'id="btnNdiBroadcast"',
      'id="btnConfidenceMonitor"',
      'id="btnBroadcastAutomation"'
    ];

    for (const btnId of requiredProButtons) {
      assert.ok(launcherHtml.includes(btnId), `${btnId} must exist in launcher Tools popover`);
    }

    // Companion API is unified in footer as Community Free / Remote Control
    assert.ok(launcherHtml.includes('id="btnOpenApiModal"'), 'btnOpenApiModal must exist in footer');
    assert.ok(launcherHtml.includes('🎛️ Companion / Remote API:'), 'Footer must display unified Companion / Remote API');
  });

  it('views/launcher.html and views/presenter.html support multi-deck file selection and live watermark preview', () => {
    const presenterHtml = fs.readFileSync(path.join(__dirname, '../views/presenter.html'), 'utf8');

    assert.ok(launcherHtml.includes('id="playlistFileInput" accept=".pdf" multiple'), 'launcher playlistFileInput must allow multiple files');
    assert.ok(presenterHtml.includes('id="playlistFileInput" accept=".pdf" multiple'), 'presenter playlistFileInput must allow multiple files');

    assert.ok(launcherHtml.includes('id="watermarkPreviewSurface"'), 'launcher must contain watermarkPreviewSurface');
    assert.ok(presenterHtml.includes('id="watermarkPreviewSurface"'), 'presenter must contain watermarkPreviewSurface');
  });

  it('views/launcher.html includes all 7 pre-flight modal dialogs', () => {
    const requiredModals = [
      'id="watermarkModal"',
      'id="audienceBannerModal"',
      'id="playlistModal"',
      'id="metricsModal"',
      'id="notesExportModal"',
      'id="ndiModal"',
      'id="confidenceModal"',
      'id="broadcastAutomationModal"'
    ];

    for (const modalId of requiredModals) {
      assert.ok(launcherHtml.includes(modalId), `${modalId} must exist in launcher HTML`);
    }
  });

  it('views/launcher.html links pro-features.css and loads all modular AV engines', () => {
    assert.ok(launcherHtml.includes('href="../css/pro-features.css"'), 'pro-features.css must be linked');
    assert.ok(launcherHtml.includes('src="../js/sync-channel.js"'), 'sync-channel.js must be loaded');
    assert.ok(launcherHtml.includes('src="../js/playlist-metrics.js"'), 'playlist-metrics.js must be loaded');
    assert.ok(launcherHtml.includes('src="../js/watermark-banner.js"'), 'watermark-banner.js must be loaded');
    assert.ok(launcherHtml.includes('src="../js/ndi-engine.js"'), 'ndi-engine.js must be loaded');
    assert.ok(launcherHtml.includes('src="../js/broadcast-automation.js"'), 'broadcast-automation.js must be loaded');
  });

  it('css/common.css includes shared styling for pro-tools-dropdown-wrapper and popover', () => {
    assert.ok(commonCss.includes('.pro-tools-dropdown-wrapper'), 'CSS must define .pro-tools-dropdown-wrapper');
    assert.ok(commonCss.includes('.btn-tools-menu'), 'CSS must define .btn-tools-menu');
    assert.ok(commonCss.includes('.pro-tools-popover'), 'CSS must define .pro-tools-popover');
    assert.ok(commonCss.includes('.pro-tools-menu-item'), 'CSS must define .pro-tools-menu-item');
  });

  it('js/launcher.js defines and invokes setupProToolsMenu', () => {
    assert.ok(launcherJs.includes('function setupProToolsMenu()'), 'setupProToolsMenu function must be defined');
    assert.ok(launcherJs.includes('setupProToolsMenu();'), 'setupProToolsMenu must be invoked during setup');
  });
});
