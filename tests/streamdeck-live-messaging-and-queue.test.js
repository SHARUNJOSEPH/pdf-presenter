/**
 * tests/streamdeck-live-messaging-and-queue.test.js
 * Verification of Enterprise Pro Key Gating, Stream Deck Live Messaging API (/api/message),
 * and Home Screen Speaker Queue UI Architecture.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { LicenseManager } = require('../js/license-manager');

describe('Enterprise Pro Strict Key Requirement (No Keyless Bypass)', () => {
  let licenseManager;

  beforeEach(() => {
    licenseManager = new LicenseManager();
  });

  it('strictly rejects setEdition("pro") when vault is empty and returns KEY_REQUIRED', () => {
    licenseManager.forgetStoredLicense();
    assert.strictEqual(licenseManager.getPublicStatus().isPro, false);
    assert.strictEqual(licenseManager.getPublicStatus().hasStoredKey, false);

    const res = licenseManager.setEdition('pro');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'KEY_REQUIRED');

    const status = licenseManager.getPublicStatus();
    assert.strictEqual(status.isPro, false);
    assert.strictEqual(status.tier, 'free');
    assert.strictEqual(status.activeEdition, 'free');
  });

  it('strictly rejects toggleEdition() when no key is stored in vault', () => {
    licenseManager.forgetStoredLicense();
    assert.strictEqual(licenseManager.getPublicStatus().activeEdition, 'free');

    const toggleRes = licenseManager.toggleEdition();
    assert.strictEqual(toggleRes.success, false);
    assert.strictEqual(toggleRes.error, 'KEY_REQUIRED');
    assert.strictEqual(licenseManager.getPublicStatus().isPro, false);
  });
});

describe('Stream Deck & Companion Live Messaging API (/api/message)', () => {
  let serverInstance;
  let serverPort;
  let serverModule;

  before(async () => {
    serverModule = require('../server');
    await new Promise((resolve) => {
      serverInstance = serverModule.server.listen(0, '127.0.0.1', () => {
        serverPort = serverInstance.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance) {
      await new Promise(r => serverInstance.close(r));
    }
  });

  function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: serverPort,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });

      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  it('rejects /api/message with 402 when Companion API unauthorized in Free tier', async () => {
    serverModule.licenseManager.forgetStoredLicense();
    const res = await makeRequest('/api/message?text=Hello', 'GET');
    assert.strictEqual(res.status, 402);
    assert.strictEqual(res.body.code, 'PRO_REQUIRED');
  });

  it('accepts /api/message and defaults target to "presenter" (Presenter Cockpit)', async () => {
    serverModule.licenseManager.startCompanionTrial();

    const res = await makeRequest('/api/message?text=5+MINUTES+REMAINING', 'GET');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.target, 'presenter');
    assert.strictEqual(res.body.text, '5 MINUTES REMAINING');
    assert.strictEqual(res.body.duration, 10000);
  });

  it('routes /api/message to audience lower-third ticker when target=audience', async () => {
    const res = await makeRequest('/api/message?text=Audience+Notice&target=audience&duration=15', 'GET');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.target, 'audience');
    assert.strictEqual(res.body.text, 'Audience Notice');
    assert.strictEqual(res.body.duration, 15000);
  });

  it('routes /api/message to stage confidence monitor when target=stage', async () => {
    const res = await makeRequest('/api/message?text=Stage+Cue&target=stage', 'GET');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.target, 'stage');
    assert.strictEqual(res.body.text, 'Stage Cue');
  });

  it('routes /api/message to all screens when target=all', async () => {
    const res = await makeRequest('/api/message?text=Global+Alert&target=all', 'GET');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.target, 'all');
    assert.strictEqual(res.body.text, 'Global Alert');
  });

  it('supports POST /api/message with JSON body', async () => {
    const payload = {
      text: 'POST Message from Stream Deck',
      target: 'presenter',
      duration: 12
    };
    const res = await makeRequest('/api/message', 'POST', payload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.target, 'presenter');
    assert.strictEqual(res.body.text, 'POST Message from Stream Deck');
    assert.strictEqual(res.body.duration, 12000);
  });

  it('clears live message via DELETE or action=clear', async () => {
    const res1 = await makeRequest('/api/message?target=presenter', 'DELETE');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.success, true);

    const res2 = await makeRequest('/api/message?action=clear&target=audience', 'GET');
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.success, true);
  });

  it('rejects /api/message with 400 when message text is missing', async () => {
    const res = await makeRequest('/api/message?target=presenter', 'GET');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  it('rejects /api/message with 400 on invalid target', async () => {
    const res = await makeRequest('/api/message?text=Hello&target=invalid_screen', 'GET');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
  });

  it('includes /api/message in /api/info endpoints documentation', async () => {
    const res = await makeRequest('/api/info', 'GET');
    assert.strictEqual(res.status, 200);
    const endpoints = res.body.endpoints;
    const msgEndpoint = endpoints.find(e => e.path && e.path.includes('/api/message'));
    assert.ok(msgEndpoint, '/api/message must be present in /api/info endpoints list');
  });
});

describe('DOM & UI Architecture Verification', () => {
  const launcherHtml = fs.readFileSync(path.join(__dirname, '../views/launcher.html'), 'utf8');
  const presenterHtml = fs.readFileSync(path.join(__dirname, '../views/presenter.html'), 'utf8');
  const launcherCss = fs.readFileSync(path.join(__dirname, '../css/launcher.css'), 'utf8');
  const presenterCss = fs.readFileSync(path.join(__dirname, '../css/presenter.css'), 'utf8');

  it('views/launcher.html contains Home Screen Speaker Queue card', () => {
    assert.ok(launcherHtml.includes('id="launcherPlaylistSection"'));
    assert.ok(launcherHtml.includes('id="launcherPlaylistCards"'));
    assert.ok(launcherHtml.includes('id="launcherPlaylistCount"'));
    assert.ok(launcherHtml.includes('id="btnLauncherAddDeck"'));
    assert.ok(launcherHtml.includes('id="btnLauncherClearPlaylist"'));
    assert.ok(launcherHtml.includes('id="pdfFileInput"'));
    assert.ok(launcherHtml.includes('multiple'));
  });

  it('views/launcher.html contains Stream Deck Live Message generator in apiModal', () => {
    assert.ok(launcherHtml.includes('id="selStreamDeckTarget"'));
    assert.ok(launcherHtml.includes('id="txtStreamDeckSample"'));
    assert.ok(launcherHtml.includes('id="codeStreamDeckUrl"'));
    assert.ok(launcherHtml.includes('id="btnCopyStreamDeckUrl"'));
  });

  it('views/presenter.html contains Presenter Cockpit live alert banner', () => {
    assert.ok(presenterHtml.includes('id="presenterStageCueBanner"'));
    assert.ok(presenterHtml.includes('id="presenterStageCueText"'));
    assert.ok(presenterHtml.includes('id="presenterStageCueTag"'));
    assert.ok(presenterHtml.includes('id="presenterStageCueTimer"'));
    assert.ok(presenterHtml.includes('id="btnDismissPresenterCue"'));
  });

  it('css/presenter.css and css/launcher.css contain required styling classes', () => {
    assert.ok(presenterCss.includes('.presenter-cockpit-cue-banner'));
    assert.ok(presenterCss.includes('.presenter-cockpit-cue-inner'));
    assert.ok(presenterCss.includes('.cue-banner-timer'));
    assert.ok(launcherCss.includes('.launcher-playlist-section'));
    assert.ok(launcherCss.includes('.launcher-deck-item'));
  });

  it('views contain Remove Key button and common.css guarantees upgradeProModal top z-index', () => {
    const commonCss = fs.readFileSync(path.join(__dirname, '../css/common.css'), 'utf8');
    const upgradeModalJs = fs.readFileSync(path.join(__dirname, '../js/upgrade-modal.js'), 'utf8');

    assert.ok(launcherHtml.includes('id="btnForgetLicense"'));
    assert.ok(launcherHtml.includes('btn-remove-key'));
    assert.ok(presenterHtml.includes('id="btnForgetLicense"'));
    assert.ok(presenterHtml.includes('btn-remove-key'));

    assert.ok(commonCss.includes('#upgradeProModal'));
    assert.ok(commonCss.includes('10050'));
    assert.ok(commonCss.includes('.btn-remove-key'));

    // upgrade-modal.js must verify hasKey before attempting setEdition and pop up upgrade modal unobstructed
    assert.ok(upgradeModalJs.includes('const hasKey = Boolean('));
    assert.ok(upgradeModalJs.includes('openModal(\'edition_switch\', true);'));
    assert.ok(upgradeModalJs.includes('aboutModal.classList.remove(\'open\');'));
  });
});
