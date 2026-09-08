// tests/timer-annotation.test.js - Unit & Integration Tests for Smart Countdown Timer & Annotation Suite
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { URL } = require('node:url');

const TimerAnnotationEngine = require('../js/timer-annotation.js');
const licenseManager = require('../js/license-manager.js');
const serverModule = require('../server.js');

describe('Smart Countdown Timer - Math, Phases & Gating', () => {
  it('initializes in countup mode with zero seconds', () => {
    const engine = new TimerAnnotationEngine();
    const state = engine.getTimerState();
    assert.equal(state.timerMode, 'countup');
    assert.equal(state.timerSeconds, 0);
    assert.equal(state.timerRunning, false);
    assert.equal(state.phase, 'normal');
    assert.equal(state.formatted, '00:00');
    assert.equal(state.isOvertime, false);
    assert.equal(state.overtimeSeconds, 0);
  });

  it('gating: blocks countdown mode and duration setting in Free tier', () => {
    let proBlockedFeature = null;
    const engine = new TimerAnnotationEngine({
      isPro: false,
      onProRequired: (feature) => { proBlockedFeature = feature; }
    });

    const setModeResult = engine.setTimerMode('countdown');
    assert.equal(setModeResult, false);
    assert.equal(engine.getTimerState().timerMode, 'countup');
    assert.equal(proBlockedFeature, 'countdown');

    const setDurationResult = engine.setDuration(600);
    assert.equal(setDurationResult, false);
    assert.equal(engine.getTimerState().timerDuration, 0);
  });

  it('allows countdown mode and presets in Pro tier', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });
    const success = engine.setPreset('10m');
    assert.equal(success, true);

    const state = engine.getTimerState();
    assert.equal(state.timerMode, 'countdown');
    assert.equal(state.timerDuration, 600);
    assert.equal(state.timerRemaining, 600);
    assert.equal(state.formatted, '10:00');
    assert.equal(state.phase, 'normal');
  });

  it('accurately checks all 7 keynote presets in seconds', () => {
    assert.equal(TimerAnnotationEngine.PRESETS['5m'], 300);
    assert.equal(TimerAnnotationEngine.PRESETS['10m'], 600);
    assert.equal(TimerAnnotationEngine.PRESETS['15m'], 900);
    assert.equal(TimerAnnotationEngine.PRESETS['20m'], 1200);
    assert.equal(TimerAnnotationEngine.PRESETS['30m'], 1800);
    assert.equal(TimerAnnotationEngine.PRESETS['45m'], 2700);
    assert.equal(TimerAnnotationEngine.PRESETS['60m'], 3600);
  });

  it('phase tracking: Normal (cyan/green) when remaining > 300s (5 min)', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });
    engine.setDuration(600); // 10 minutes

    // 100 seconds elapsed -> 500 seconds remaining
    for (let i = 0; i < 100; i++) engine.tick();
    const state = engine.getTimerState();
    assert.equal(state.timerRemaining, 500);
    assert.equal(state.phase, 'normal');
    assert.equal(state.formatted, '08:20');
    assert.equal(state.isOvertime, false);
  });

  it('phase tracking: Warning (pulsing amber) when remaining <= 300s (and > 60s)', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });
    engine.setDuration(600);

    // 300 seconds elapsed -> 300 seconds remaining
    for (let i = 0; i < 300; i++) engine.tick();
    const state300 = engine.getTimerState();
    assert.equal(state300.timerRemaining, 300);
    assert.equal(state300.phase, 'warning');
    assert.equal(state300.formatted, '05:00');

    // 450 seconds elapsed -> 150 seconds remaining
    for (let i = 0; i < 150; i++) engine.tick();
    const state150 = engine.getTimerState();
    assert.equal(state150.timerRemaining, 150);
    assert.equal(state150.phase, 'warning');
    assert.equal(state150.formatted, '02:30');
  });

  it('phase tracking: Critical (pulsing red) when remaining <= 60s (and > 0s)', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });
    engine.setDuration(600);

    // 540 seconds elapsed -> 60 seconds remaining
    for (let i = 0; i < 540; i++) engine.tick();
    const state60 = engine.getTimerState();
    assert.equal(state60.timerRemaining, 60);
    assert.equal(state60.phase, 'critical');
    assert.equal(state60.formatted, '01:00');

    // 599 seconds elapsed -> 1 second remaining
    for (let i = 0; i < 59; i++) engine.tick();
    const state1 = engine.getTimerState();
    assert.equal(state1.timerRemaining, 1);
    assert.equal(state1.phase, 'critical');
    assert.equal(state1.formatted, '00:01');
  });

  it('phase tracking: Overtime flashing red +MM:SS when remaining <= 0', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });
    engine.setDuration(600);

    // 600 seconds elapsed -> remaining hits 0
    for (let i = 0; i < 600; i++) engine.tick();
    const stateZero = engine.getTimerState();
    assert.equal(stateZero.timerRemaining, 0);
    assert.equal(stateZero.isOvertime, true);
    assert.equal(stateZero.overtimeSeconds, 0);
    assert.equal(stateZero.phase, 'overtime');
    assert.equal(stateZero.formatted, '+00:00');

    // 605 seconds elapsed -> 5 seconds overtime
    for (let i = 0; i < 5; i++) engine.tick();
    const stateOver5 = engine.getTimerState();
    assert.equal(stateOver5.timerRemaining, 0);
    assert.equal(stateOver5.isOvertime, true);
    assert.equal(stateOver5.overtimeSeconds, 5);
    assert.equal(stateOver5.phase, 'overtime');
    assert.equal(stateOver5.formatted, '+00:05');

    // 675 seconds elapsed -> 75 seconds overtime (1 min 15 sec)
    for (let i = 0; i < 70; i++) engine.tick();
    const stateOver75 = engine.getTimerState();
    assert.equal(stateOver75.overtimeSeconds, 75);
    assert.equal(stateOver75.formatted, '+01:15');
  });

  it('controls: start, pause, reset manage running state and elapsed time', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });
    engine.setDuration(300);

    engine.start();
    assert.equal(engine.getTimerState().timerRunning, true);

    engine.tick();
    engine.tick();
    assert.equal(engine.getTimerState().timerSeconds, 2);

    engine.pause();
    assert.equal(engine.getTimerState().timerRunning, false);
    assert.equal(engine.getTimerState().timerSeconds, 2);

    engine.reset();
    assert.equal(engine.getTimerState().timerRunning, false);
    assert.equal(engine.getTimerState().timerSeconds, 0);
    assert.equal(engine.getTimerState().timerRemaining, 300);
  });
});

describe('Professional Annotation Suite - Palette, Highlighter & SyncBus', () => {
  it('defines exact required color palette hex codes', () => {
    assert.equal(TimerAnnotationEngine.PALETTE.YELLOW, '#eab308');
    assert.equal(TimerAnnotationEngine.PALETTE.NEON_GREEN, '#22c55e');
    assert.equal(TimerAnnotationEngine.PALETTE.ELECTRIC_BLUE, '#38bdf8');
    assert.equal(TimerAnnotationEngine.PALETTE.HOT_PINK, '#ec4899');
    assert.equal(TimerAnnotationEngine.PALETTE.WHITE, '#ffffff');
  });

  it('defines stroke widths: Fine (2px), Medium (5px), Thick (10px), Highlighter (24px)', () => {
    assert.equal(TimerAnnotationEngine.STROKE_WIDTHS.FINE, 2);
    assert.equal(TimerAnnotationEngine.STROKE_WIDTHS.MEDIUM, 5);
    assert.equal(TimerAnnotationEngine.STROKE_WIDTHS.THICK, 10);
    assert.equal(TimerAnnotationEngine.STROKE_WIDTHS.HIGHLIGHTER, 24);
  });

  it('hexToRgba helper converts hex to rgba with 0.35 alpha blending', () => {
    const yellowAlpha = TimerAnnotationEngine.hexToRgba('#eab308', 0.35);
    assert.equal(yellowAlpha, 'rgba(234, 179, 8, 0.35)');

    const greenAlpha = TimerAnnotationEngine.hexToRgba('#22c55e', 0.35);
    assert.equal(greenAlpha, 'rgba(34, 197, 94, 0.35)');
  });

  it('gating: Free tier is restricted to yellow pen (#eab308) and laser', () => {
    let proBlocked = null;
    const engine = new TimerAnnotationEngine({
      isPro: false,
      onProRequired: (feature) => { proBlocked = feature; }
    });

    // Yellow allowed
    const yellowRes = engine.setColor('#eab308');
    assert.equal(yellowRes.success, true);
    assert.equal(engine.getColor(), '#eab308');

    // Neon green blocked
    const greenRes = engine.setColor('#22c55e');
    assert.equal(greenRes.success, false);
    assert.equal(greenRes.error, 'PRO_REQUIRED');
    assert.equal(engine.getColor(), '#eab308');
    assert.equal(proBlocked, 'multi_color');

    // Electric blue blocked
    const blueRes = engine.setColor('#38bdf8');
    assert.equal(blueRes.success, false);
    assert.equal(engine.getColor(), '#eab308');

    // Highlighter tool blocked
    const hlRes = engine.setTool('highlighter');
    assert.equal(hlRes.success, false);
    assert.equal(hlRes.error, 'PRO_REQUIRED');
    assert.notEqual(engine.getTool(), 'highlighter');
  });

  it('Pro tier unlocks all 5 palette colors and highlighter mode', () => {
    const engine = new TimerAnnotationEngine({ isPro: true });

    assert.equal(engine.setColor('#22c55e').success, true);
    assert.equal(engine.getColor(), '#22c55e');

    assert.equal(engine.setColor('#38bdf8').success, true);
    assert.equal(engine.getColor(), '#38bdf8');

    assert.equal(engine.setColor('#ec4899').success, true);
    assert.equal(engine.getColor(), '#ec4899');

    assert.equal(engine.setColor('#ffffff').success, true);
    assert.equal(engine.getColor(), '#ffffff');

    assert.equal(engine.setTool('highlighter').success, true);
    assert.equal(engine.getTool(), 'highlighter');
  });

  it('relays stroke data with color, alpha, and width over PresentationSyncBus', () => {
    const messages = [];
    const mockSyncBus = {
      send: (msg) => messages.push(msg)
    };

    const engine = new TimerAnnotationEngine({
      syncBus: mockSyncBus,
      isPro: true
    });

    // Configure highlighter with Electric Blue (#38bdf8)
    engine.setTool('highlighter');
    engine.setColor('#38bdf8');

    // Draw stroke
    engine.startStroke({ x: 0.2, y: 0.3 });
    engine.addPoint({ x: 0.25, y: 0.35 });
    engine.endStroke();

    assert.equal(messages.length, 3);

    // PEN_DOWN
    assert.equal(messages[0].type, 'PEN_DOWN');
    assert.equal(messages[0].color, '#38bdf8');
    assert.equal(messages[0].alpha, 0.35);
    assert.equal(messages[0].width, 24);
    assert.equal(messages[0].tool, 'highlighter');
    assert.deepEqual(messages[0].point, { x: 0.2, y: 0.3 });

    // PEN_POINT
    assert.equal(messages[1].type, 'PEN_POINT');
    assert.equal(messages[1].alpha, 0.35);
    assert.equal(messages[1].width, 24);
    assert.deepEqual(messages[1].point, { x: 0.25, y: 0.35 });

    // PEN_UP
    assert.equal(messages[2].type, 'PEN_UP');
    assert.equal(messages[2].alpha, 0.35);
    assert.equal(messages[2].width, 24);

    // Clear annotations
    engine.clearAnnotations();
    assert.equal(messages[3].type, 'CLEAR_PEN');
    assert.equal(engine.getStrokes().length, 0);
  });
});

describe('Companion REST API - Timer Endpoints & Status Telemetry', () => {
  let server;
  let baseUrl;
  const TEST_PORT = 3288;

  before(() => {
    server = serverModule.server;
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

  beforeEach(() => {
    licenseManager.resetToFree();
    serverModule.resetServerTimer();
    serverModule.state.timerMode = 'countup';
    serverModule.state.timerDuration = 0;
  });

  function apiCall(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const payload = body ? JSON.stringify(body) : null;
      const headers = {};
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request(url, { method, headers }, (res) => {
        let resData = '';
        res.on('data', chunk => { resData += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(resData); } catch (e) {}
          resolve({ status: res.statusCode, body: resData, json });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  it('rejects POST /api/timer/set with 402 when Companion API is unauthorized in Free tier', async () => {
    const res = await apiCall('/api/timer/set', 'POST', { duration: 600, mode: 'countdown' });
    assert.equal(res.status, 402);
    assert.equal(res.json.code, 'PRO_REQUIRED');
  });

  it('rejects POST /api/timer/start with 402 when unauthorized', async () => {
    const res = await apiCall('/api/timer/start', 'POST');
    assert.equal(res.status, 402);
    assert.equal(res.json.code, 'PRO_REQUIRED');
  });

  it('rejects POST /api/timer/pause with 402 when unauthorized', async () => {
    const res = await apiCall('/api/timer/pause', 'POST');
    assert.equal(res.status, 402);
    assert.equal(res.json.code, 'PRO_REQUIRED');
  });

  it('rejects POST /api/timer/reset with 402 when unauthorized', async () => {
    const res = await apiCall('/api/timer/reset', 'POST');
    assert.equal(res.status, 402);
    assert.equal(res.json.code, 'PRO_REQUIRED');
  });

  it('allows POST /api/timer/set when authorized (trial or Pro) and updates state', async () => {
    licenseManager.startCompanionTrial();

    const res = await apiCall('/api/timer/set', 'POST', { duration: 900, mode: 'countdown' });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.state.timerDuration, 900);
    assert.equal(res.json.state.timerMode, 'countdown');
    assert.equal(res.json.state.timerRemaining, 900);
    assert.equal(res.json.state.isOvertime, false);
    assert.equal(res.json.state.overtimeSeconds, 0);
  });

  it('POST /api/timer/start, pause, reset control server timer execution', async () => {
    licenseManager.startCompanionTrial();

    // Start
    const startRes = await apiCall('/api/timer/start', 'POST');
    assert.equal(startRes.status, 200);
    assert.equal(startRes.json.state.timerRunning, true);

    // Pause
    const pauseRes = await apiCall('/api/timer/pause', 'POST');
    assert.equal(pauseRes.status, 200);
    assert.equal(pauseRes.json.state.timerRunning, false);

    // Reset
    const resetRes = await apiCall('/api/timer/reset', 'POST');
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.json.state.timerSeconds, 0);
  });

  it('GET /api/status includes comprehensive timer telemetry with overtime calculation', async () => {
    licenseManager.startCompanionTrial();

    // Configure 10-minute countdown (600s)
    await apiCall('/api/timer/set', 'POST', { duration: 600, mode: 'countdown' });

    // Simulate 645 seconds elapsed (45s overtime)
    serverModule.state.timerSeconds = 645;

    const res = await apiCall('/api/status', 'GET');
    assert.equal(res.status, 200);
    assert.equal(res.json.timerMode, 'countdown');
    assert.equal(res.json.timerSeconds, 645);
    assert.equal(res.json.timerDuration, 600);
    assert.equal(res.json.timerRemaining, 0);
    assert.equal(res.json.isOvertime, true);
    assert.equal(res.json.overtimeSeconds, 45);
    assert.equal(res.json.timerFormatted, '+00:45');
  });
});
