/**
 * tests/watermark-banner.test.js
 * Comprehensive unit and integration test suite for:
 * 1. Watermark & Branding Engine (state, clamping, positions, broadcasting)
 * 2. Audience Lower-Third Banner (state, sticky, duration, broadcasting)
 * 3. Pro Entitlement Gating
 * 4. DOM & CSS Architecture Verification (views/audience.html, css/audience.css, views/presenter.html)
 * 5. Companion REST API Endpoints (POST /api/banner, DELETE /api/banner, 402 guard)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

const WatermarkBannerEngine = require('../js/watermark-banner.js');
const licenseManager = require('../js/license-manager.js');

describe('Watermark & Event Branding Engine', () => {
  it('initializes with correct default watermark state', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
    const state = engine.getWatermarkState();

    assert.equal(state.enabled, false, 'Default enabled should be false');
    assert.equal(state.position, 'bottom-right', 'Default position should be bottom-right');
    assert.equal(state.opacity, 0.8, 'Default opacity should be 0.8');
    assert.equal(state.scale, 1.0, 'Default scale should be 1.0');
  });

  it('manages watermark text, image, and valid positions', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();

    engine.setWatermark({
      enabled: true,
      text: 'ACME ANNUAL KEYNOTE 2026',
      position: 'top-left'
    }, false);

    let state = engine.getWatermarkState();
    assert.equal(state.enabled, true);
    assert.equal(state.text, 'ACME ANNUAL KEYNOTE 2026');
    assert.equal(state.position, 'top-left');

    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const pos of positions) {
      engine.setWatermark({ position: pos }, false);
      assert.equal(engine.getWatermarkState().position, pos);
    }

    // Invalid position is ignored
    engine.setWatermark({ position: 'invalid-center' }, false);
    assert.equal(engine.getWatermarkState().position, 'bottom-right');
  });

  it('clamps opacity within 0.1 to 1.0 range', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();

    engine.setWatermark({ opacity: 1.5 }, false);
    assert.equal(engine.getWatermarkState().opacity, 1.0);

    engine.setWatermark({ opacity: 0.02 }, false);
    assert.equal(engine.getWatermarkState().opacity, 0.1);

    engine.setWatermark({ opacity: 0.65 }, false);
    assert.equal(engine.getWatermarkState().opacity, 0.65);
  });

  it('clamps scale within 0.5 to 1.5 range', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();

    engine.setWatermark({ scale: 2.2 }, false);
    assert.equal(engine.getWatermarkState().scale, 1.5);

    engine.setWatermark({ scale: 0.2 }, false);
    assert.equal(engine.getWatermarkState().scale, 0.5);

    engine.setWatermark({ scale: 1.25 }, false);
    assert.equal(engine.getWatermarkState().scale, 1.25);
  });

  it('broadcasts SET_WATERMARK with full configuration over syncBus', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
    let capturedEvent = null;

    engine.syncBus = {
      send: (evt) => {
        capturedEvent = evt;
      }
    };

    engine.setWatermark({
      enabled: true,
      text: 'CONFIDENTIAL PREVIEW',
      position: 'top-right',
      opacity: 0.75,
      scale: 1.2
    }, true);

    assert.ok(capturedEvent, 'Broadcast event must be dispatched');
    assert.equal(capturedEvent.type, 'SET_WATERMARK');
    assert.equal(capturedEvent.config.enabled, true);
    assert.equal(capturedEvent.config.text, 'CONFIDENTIAL PREVIEW');
    assert.equal(capturedEvent.config.position, 'top-right');
    assert.equal(capturedEvent.config.opacity, 0.75);
    assert.equal(capturedEvent.config.scale, 1.2);
  });
});

describe('Live Audience Lower-Third Ticker Banner Engine', () => {
  it('manages banner state with sticky mode (duration 0)', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
    let capturedEvent = null;

    engine.syncBus = {
      send: (evt) => {
        capturedEvent = evt;
      }
    };

    const state = engine.showBanner('📢 Q&A session starts in 5 minutes', 0);
    assert.equal(state.active, true);
    assert.equal(state.message, '📢 Q&A session starts in 5 minutes');
    assert.equal(state.duration, 0);
    assert.equal(state.displayMode, 'sticky');

    assert.ok(capturedEvent);
    assert.equal(capturedEvent.type, 'SHOW_BANNER');
    assert.equal(capturedEvent.message, '📢 Q&A session starts in 5 minutes');
    assert.equal(capturedEvent.duration, 0);
  });

  it('manages banner state with auto-dismiss duration', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
    let capturedEvent = null;

    engine.syncBus = {
      send: (evt) => {
        capturedEvent = evt;
      }
    };

    const state = engine.showBanner('☕ 10-Minute Coffee Break', 30);
    assert.equal(state.active, true);
    assert.equal(state.message, '☕ 10-Minute Coffee Break');
    assert.equal(state.duration, 30);
    assert.equal(state.displayMode, 'auto');

    assert.ok(capturedEvent);
    assert.equal(capturedEvent.type, 'SHOW_BANNER');
    assert.equal(capturedEvent.duration, 30);
  });

  it('hides banner and broadcasts HIDE_BANNER', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
    let capturedEvent = null;

    engine.syncBus = {
      send: (evt) => {
        capturedEvent = evt;
      }
    };

    engine.showBanner('Test Message', 10);
    const state = engine.hideBanner();

    assert.equal(state.active, false);
    assert.equal(state.message, '');
    assert.equal(state.duration, 0);

    assert.ok(capturedEvent);
    assert.equal(capturedEvent.type, 'HIDE_BANNER');
  });
});

describe('Pro Entitlement Paywall Gating', () => {
  it('guards watermark and banner behind window.UpgradeModal.isPro()', () => {
    const engine = new WatermarkBannerEngine.WatermarkBannerEngine();

    let upgradeOpenedWith = null;
    global.window = {
      UpgradeModal: {
        isPro: () => false,
        open: (feature) => {
          upgradeOpenedWith = feature;
        }
      }
    };

    assert.equal(engine.isPro(), false);
    assert.equal(engine.guardPro('watermark'), false);
    assert.equal(upgradeOpenedWith, 'watermark');

    assert.equal(engine.guardPro('banner'), false);
    assert.equal(upgradeOpenedWith, 'banner');

    // Simulate Pro license unlocked
    global.window.UpgradeModal.isPro = () => true;
    assert.equal(engine.isPro(), true);
    assert.equal(engine.guardPro('watermark'), true);
  });
});

describe('DOM & CSS Architecture Verification', () => {
  const audienceHtmlPath = path.join(__dirname, '../views/audience.html');
  const presenterHtmlPath = path.join(__dirname, '../views/presenter.html');
  const audienceCssPath = path.join(__dirname, '../css/audience.css');

  const audienceHtml = fs.readFileSync(audienceHtmlPath, 'utf8');
  const presenterHtml = fs.readFileSync(presenterHtmlPath, 'utf8');
  const audienceCss = fs.readFileSync(audienceCssPath, 'utf8');

  it('views/audience.html contains audienceWatermark inside canvasContainer', () => {
    assert.ok(audienceHtml.includes('id="audienceWatermark"'), 'audienceWatermark must exist');
    assert.ok(audienceHtml.includes('class="audience-watermark"'), 'audience-watermark class must exist');

    const containerIdx = audienceHtml.indexOf('id="canvasContainer"');
    const watermarkIdx = audienceHtml.indexOf('id="audienceWatermark"');
    const curtainIdx = audienceHtml.indexOf('id="screenCurtain"');

    assert.ok(watermarkIdx > containerIdx, 'Watermark must be inside canvasContainer');
    assert.ok(watermarkIdx < curtainIdx, 'Watermark must be placed before screenCurtain');
  });

  it('views/audience.html contains audienceBanner with icon and text span', () => {
    assert.ok(audienceHtml.includes('id="audienceBanner"'), 'audienceBanner must exist');
    assert.ok(audienceHtml.includes('class="audience-banner"'), 'audience-banner class must exist');
    assert.ok(audienceHtml.includes('class="audience-banner-inner"'), 'audience-banner-inner must exist');
    assert.ok(audienceHtml.includes('id="audienceBannerText"'), 'audienceBannerText must exist');
  });

  it('views/presenter.html contains btnWatermark, btnAudienceBanner, and modals', () => {
    assert.ok(presenterHtml.includes('id="btnWatermark"'), 'btnWatermark must exist');
    assert.ok(presenterHtml.includes('id="btnAudienceBanner"'), 'btnAudienceBanner must exist');
    assert.ok(presenterHtml.includes('id="watermarkModal"'), 'watermarkModal must exist');
    assert.ok(presenterHtml.includes('id="audienceBannerModal"'), 'audienceBannerModal must exist');
    assert.ok(presenterHtml.includes('src="../js/watermark-banner.js"'), 'watermark-banner.js script must be linked');
  });

  it('css/audience.css contains required styling for .audience-watermark and .audience-banner', () => {
    assert.ok(audienceCss.includes('.audience-watermark'), '.audience-watermark rule must exist');
    assert.ok(audienceCss.includes('pointer-events: none;'), 'Watermark must have pointer-events none');
    assert.ok(audienceCss.includes('z-index: 10;'), 'Watermark must have z-index 10');
    assert.ok(audienceCss.includes('.audience-banner'), '.audience-banner rule must exist');
    assert.ok(audienceCss.includes('rgba(15, 23, 42, 0.92)'), 'Banner must have glassmorphism background');
    assert.ok(audienceCss.includes('backdrop-filter: blur'), 'Banner must have backdrop-filter blur');
    assert.ok(audienceCss.includes('font-size: 20px;'), 'Banner must have 20px font size');
    assert.ok(audienceCss.includes('linear-gradient(90deg, #06b6d4, #8b5cf6)'), 'Banner must have cyan/violet gradient border-top');
  });
});

describe('Companion REST API Endpoints (/api/banner)', () => {
  const TEST_PORT = 3198;
  const { server } = require('../server.js');
  let baseUrl;

  before(() => {
    return new Promise((resolve) => {
      server.listen(TEST_PORT, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  function makeRequest(urlPath, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlPath, baseUrl);
      const postData = body ? JSON.stringify(body) : '';
      const headers = {
        'Content-Type': 'application/json'
      };
      if (postData) {
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request(u, { method, headers }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(resBody); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, body: resBody, json });
        });
      });
      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  it('rejects POST /api/banner with 402 if Companion API unauthorized (Free tier)', async () => {
    licenseManager.resetToFree();
    assert.equal(licenseManager.isCompanionApiAuthorized(), false);

    const res = await makeRequest('/api/banner', 'POST', {
      message: 'Unauthorized banner test',
      duration: 10
    });

    assert.equal(res.status, 402, 'Must return 402 Payment Required for Free tier without trial');
    assert.equal(res.json.success, false);
  });

  it('rejects DELETE /api/banner with 402 if Companion API unauthorized (Free tier)', async () => {
    licenseManager.resetToFree();

    const res = await makeRequest('/api/banner', 'DELETE');
    assert.equal(res.status, 402, 'Must return 402 Payment Required for Free tier without trial');
  });

  it('allows POST /api/banner when authorized and broadcasts SHOW_BANNER', async () => {
    // Unlock Pro or start trial
    licenseManager.startCompanionTrial();
    assert.equal(licenseManager.isCompanionApiAuthorized(), true);

    const res = await makeRequest('/api/banner', 'POST', {
      message: '📢 Welcome to the Keynote Presentation!',
      duration: 25
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.banner.message, '📢 Welcome to the Keynote Presentation!');
    assert.equal(res.json.banner.duration, 25);
  });

  it('allows DELETE /api/banner when authorized and broadcasts HIDE_BANNER', async () => {
    assert.equal(licenseManager.isCompanionApiAuthorized(), true);

    const res = await makeRequest('/api/banner', 'DELETE');
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.message, 'Audience banner hidden');

    // Clean up
    licenseManager.resetToFree();
  });
});
