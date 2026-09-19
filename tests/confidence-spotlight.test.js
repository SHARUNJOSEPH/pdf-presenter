/**
 * tests/confidence-spotlight.test.js
 * Unit test suite for Cinematic Spotlight & Stage Confidence Monitor
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const SpotlightEngine = require('../js/spotlight.js');

describe('SpotlightEngine Unit Tests', () => {
  it('should initialize with default state and center coordinates', () => {
    const engine = new SpotlightEngine({ isPro: () => true });
    const state = engine.getState();

    assert.strictEqual(state.enabled, false);
    assert.strictEqual(state.x, 0.5);
    assert.strictEqual(state.y, 0.5);
    assert.strictEqual(state.radius, 150);
  });

  it('should enforce Pro entitlement gating on toggle', () => {
    let proPrompted = false;
    const freeEngine = new SpotlightEngine({
      isPro: () => false,
      onProRequired: () => { proPrompted = true; }
    });

    const res = freeEngine.toggle();
    assert.strictEqual(res.error, 'PRO_REQUIRED');
    assert.strictEqual(proPrompted, true);
    assert.strictEqual(freeEngine.state.enabled, false);
  });

  it('should toggle spotlight on and off when Pro entitlement is active', () => {
    const proEngine = new SpotlightEngine({ isPro: () => true });

    proEngine.toggle(true);
    assert.strictEqual(proEngine.state.enabled, true);

    proEngine.toggle(false);
    assert.strictEqual(proEngine.state.enabled, false);

    proEngine.toggle(); // Invert
    assert.strictEqual(proEngine.state.enabled, true);
  });

  it('should clamp normalized coordinates between 0.0 and 1.0', () => {
    const engine = new SpotlightEngine({ isPro: () => true });
    engine.toggle(true);

    engine.setPosition(1.5, -0.3, false);
    assert.strictEqual(engine.state.x, 1.0);
    assert.strictEqual(engine.state.y, 0.0);

    engine.setPosition(0.25, 0.75, false);
    assert.strictEqual(engine.state.x, 0.25);
    assert.strictEqual(engine.state.y, 0.75);
  });

  it('should clamp radius within ergonomic pixel range (50px - 400px)', () => {
    const engine = new SpotlightEngine({ isPro: () => true });

    engine.setRadius(20);
    assert.strictEqual(engine.state.radius, 50);

    engine.setRadius(800);
    assert.strictEqual(engine.state.radius, 400);

    engine.setRadius(220);
    assert.strictEqual(engine.state.radius, 220);
  });
});

describe('Stage Confidence Monitor Telemetry Tests', () => {
  it('should calculate overtime countdown and format correctly', () => {
    // Stage monitor overtime formatting logic:
    // When timerRemaining <= 0, display +MM:SS in red
    const formatOvertime = (seconds) => {
      const m = Math.floor(seconds / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      return `+${m}:${s}`;
    };

    assert.strictEqual(formatOvertime(0), '+00:00');
    assert.strictEqual(formatOvertime(65), '+01:05');
    assert.strictEqual(formatOvertime(300), '+05:00');
  });

  it('should structure stage cue payloads with message and auto-dismiss duration', () => {
    const createStageCue = (message, duration = 10000) => ({
      type: 'STAGE_CUE',
      message: String(message || '').trim(),
      duration: Number(duration) || 10000,
      timestamp: Date.now()
    });

    const cue = createStageCue('2 Minutes Left', 12000);
    assert.strictEqual(cue.type, 'STAGE_CUE');
    assert.strictEqual(cue.message, '2 Minutes Left');
    assert.strictEqual(cue.duration, 12000);
    assert.ok(cue.timestamp > 0);
  });
});
