/**
 * tests/diagnostics-bug-report.test.js
 * Unit test suite verifying the Diagnostic Bug Report Generator and Slide Flicker Analysis.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const diagnosticsEngine = require('../js/diagnostics-engine.js');

describe('Diagnostic Bug Report Generator & Flicker Analysis Suite', () => {
  it('diagnosticsEngine.sanitizePath strips personal user folders for privacy', () => {
    const winPath = 'C:\\Users\\JohnDoe\\Documents\\presentation.pdf';
    assert.strictEqual(diagnosticsEngine.sanitizePath(winPath), 'C:\\Users\\<REDACTED>\\Documents\\presentation.pdf');

    const macPath = '/Users/sarah/Presentations/deck.pdf';
    assert.strictEqual(diagnosticsEngine.sanitizePath(macPath), '/Users/<REDACTED>/Presentations/deck.pdf');

    const linuxPath = '/home/alex/slides.pdf';
    assert.strictEqual(diagnosticsEngine.sanitizePath(linuxPath), '/home/<REDACTED>/slides.pdf');
  });

  it('diagnosticsEngine buffers runtime logs correctly with timestamps', () => {
    diagnosticsEngine.recordLog('INFO', 'Test system init', { port: 3000 });
    diagnosticsEngine.recordLog('WARN', 'Potential compositor drop', { fps: 58 });

    const logs = diagnosticsEngine.getRecentLogs(10);
    assert.ok(logs.length >= 2, 'Must contain recorded logs');

    const lastLog = logs[logs.length - 1];
    assert.strictEqual(lastLog.level, 'WARN');
    assert.ok(lastLog.message.includes('Potential compositor drop'));
    assert.ok(lastLog.timestamp, 'Log entry must have timestamp');
  });

  it('analyzeFlickerPotential detects Mixed DPI scaling disparities', () => {
    const displays = [
      { id: 1, scaleFactor: 1.5, displayFrequency: 60, isPrimary: true },
      { id: 2, scaleFactor: 1.0, displayFrequency: 60, isPrimary: false }
    ];

    const analysis = diagnosticsEngine.analyzeFlickerPotential(displays, { gpu_compositing: 'enabled' });
    assert.strictEqual(analysis.flickerRisk, 'MODERATE');
    assert.ok(analysis.warnings.some(w => w.includes('Mixed DPI Scale Factors')), 'Must flag mixed DPI scale factors');
    assert.ok(analysis.recommendations.some(r => r.includes('Windows Display Settings')), 'Must provide DPI resolution recommendation');
  });

  it('analyzeFlickerPotential detects Refresh Rate mismatch disparities', () => {
    const displays = [
      { id: 1, scaleFactor: 1.0, displayFrequency: 144, isPrimary: true },
      { id: 2, scaleFactor: 1.0, displayFrequency: 60, isPrimary: false }
    ];

    const analysis = diagnosticsEngine.analyzeFlickerPotential(displays, { gpu_compositing: 'enabled' });
    assert.strictEqual(analysis.flickerRisk, 'MODERATE');
    assert.ok(analysis.warnings.some(w => w.includes('Refresh Rate Mismatch')), 'Must flag refresh rate mismatch');
  });

  it('analyzeFlickerPotential detects disabled GPU compositing and elevates risk to HIGH when combined', () => {
    const displays = [
      { id: 1, scaleFactor: 1.25, displayFrequency: 120, isPrimary: true },
      { id: 2, scaleFactor: 1.0, displayFrequency: 60, isPrimary: false }
    ];

    const gpuFeatures = { gpu_compositing: 'disabled_software', rasterization: 'disabled_software' };
    const analysis = diagnosticsEngine.analyzeFlickerPotential(displays, gpuFeatures);
    assert.strictEqual(analysis.flickerRisk, 'HIGH');
    assert.ok(analysis.warnings.length >= 3, 'Must identify mixed DPI, refresh rate, and software compositing');
  });

  it('formatMarkdownReport outputs well-structured GitHub-flavored Markdown', () => {
    const sampleDiag = diagnosticsEngine.buildDiagnosticData({
      appVersion: '1.2.5',
      isPackaged: true,
      isStore: false,
      displays: [{ id: 1, label: 'Primary Screen', bounds: { width: 1920, height: 1080 }, scaleFactor: 1.25, displayFrequency: 60, isPrimary: true }],
      gpuFeatures: { gpu_compositing: 'enabled' },
      presentation: { hasDeck: true, slideCount: 25, currentSlide: 3 }
    });

    const markdown = diagnosticsEngine.formatMarkdownReport(sampleDiag);
    assert.ok(markdown.includes('# 📽️ PDF Presenter Suite — Diagnostic Bug Report'), 'Header must exist');
    assert.ok(markdown.includes('v1.2.5'), 'Version must be present');
    assert.ok(markdown.includes('Slide Flicker & Hardware Analysis'), 'Flicker analysis section must exist');
    assert.ok(markdown.includes('Connected Displays'), 'Displays section must exist');
    assert.ok(markdown.includes('Total Slides:** `25`'), 'Presentation slide count must exist');
  });

  it('DOM and preload verification: Bug Report UI components are properly integrated', () => {
    const launcherHtml = fs.readFileSync(path.join(__dirname, '../views/launcher.html'), 'utf8');
    const presenterHtml = fs.readFileSync(path.join(__dirname, '../views/presenter.html'), 'utf8');
    const preloadJs = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
    const commonCss = fs.readFileSync(path.join(__dirname, '../css/common.css'), 'utf8');

    // Launcher UI
    assert.ok(launcherHtml.includes('id="btnAboutRunBugReport"'), 'launcher.html must contain btnAboutRunBugReport inside About modal');
    assert.ok(launcherHtml.includes('id="btnModalRunBugReport"'), 'launcher.html must contain btnModalRunBugReport');
    assert.ok(launcherHtml.includes('id="bugReportModal"'), 'launcher.html must contain bugReportModal');
    assert.ok(launcherHtml.includes('id="btnCopyBugReport"'), 'launcher.html must contain btnCopyBugReport');
    assert.ok(launcherHtml.includes('id="btnSaveBugReport"'), 'launcher.html must contain btnSaveBugReport');

    // Presenter UI
    assert.ok(presenterHtml.includes('id="btnAboutRunBugReport"'), 'presenter.html must contain btnAboutRunBugReport inside About modal');
    assert.ok(presenterHtml.includes('id="btnModalRunBugReport"'), 'presenter.html must contain btnModalRunBugReport');
    assert.ok(presenterHtml.includes('id="bugReportModal"'), 'presenter.html must contain bugReportModal');

    // Layout responsiveness & overlap protection
    const launcherCss = fs.readFileSync(path.join(__dirname, '../css/launcher.css'), 'utf8');
    const presenterCss = fs.readFileSync(path.join(__dirname, '../css/presenter.css'), 'utf8');
    assert.ok(launcherCss.includes('.launcher-header-row'), 'launcher.css must define .launcher-header-row');
    assert.ok(launcherCss.includes('.btn-header-action'), 'launcher.css must define .btn-header-action');
    assert.ok(presenterCss.includes('.top-bar-center'), 'presenter.css must define .top-bar-center');
    assert.ok(presenterCss.includes('overflow-x: auto'), 'presenter.css must allow horizontal overflow guard');

    // Preload
    assert.ok(preloadJs.includes('generateBugReport'), 'preload.js must expose generateBugReport');
    assert.ok(preloadJs.includes('saveBugReport'), 'preload.js must expose saveBugReport');

    // CSS
    assert.ok(commonCss.includes('.modal-bug-report-card'), 'common.css must define .modal-bug-report-card');
    assert.ok(commonCss.includes('.bug-report-pre'), 'common.css must define .bug-report-pre');

    // main.js IPC handler syntax verification
    const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
    assert.ok(mainJs.includes("ipcMain.handle('generate-bug-report'"), 'main.js must define generate-bug-report IPC handler');
    assert.ok(!mainJs.includes('presentationData ?'), 'main.js must not reference undefined presentationData variable');
  });
});
