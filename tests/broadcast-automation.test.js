/**
 * tests/broadcast-automation.test.js
 * Unit test suite for OBS Studio & vMix Broadcast Automation Gateway
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const BroadcastAutomationEngine = require('../js/broadcast-automation.js');

describe('BroadcastAutomationEngine Unit Tests', () => {
  it('should initialize with default configuration and scenes', () => {
    const engine = new BroadcastAutomationEngine({ isPro: () => true });
    const config = engine.getConfig();

    assert.strictEqual(config.enabled, false);
    assert.strictEqual(config.type, 'obs');
    assert.strictEqual(config.obsPort, 4455);
    assert.strictEqual(config.scenes.onStart, 'Presentation');
    assert.strictEqual(config.scenes.onBlackout, 'Speaker Camera');
    assert.strictEqual(config.scenes.onEnd, 'Closing Scene');
  });

  it('should enforce Pro entitlement gating when enabling automation', () => {
    let proPrompted = false;
    const freeEngine = new BroadcastAutomationEngine({
      isPro: () => false,
      onProRequired: () => { proPrompted = true; }
    });

    const res = freeEngine.enable();
    assert.strictEqual(res.error, 'PRO_REQUIRED');
    assert.strictEqual(proPrompted, true);
    assert.strictEqual(freeEngine.config.enabled, false);
  });

  it('should enable and disable automation when Pro entitlement is verified', () => {
    const proEngine = new BroadcastAutomationEngine({ isPro: () => true });

    const resEnable = proEngine.enable();
    assert.strictEqual(resEnable.success, true);
    assert.strictEqual(proEngine.config.enabled, true);

    proEngine.disable();
    assert.strictEqual(proEngine.config.enabled, false);
  });

  it('should correctly map presentation actions to target broadcast scenes', () => {
    const engine = new BroadcastAutomationEngine({
      isPro: () => true,
      sceneOnStart: 'Keynote Main',
      sceneOnBlackout: 'Podium Camera',
      sceneOnEnd: 'Sponsor Loop'
    });

    assert.strictEqual(engine.getTargetSceneForAction('start'), 'Keynote Main');
    assert.strictEqual(engine.getTargetSceneForAction('blackout'), 'Podium Camera');
    assert.strictEqual(engine.getTargetSceneForAction('end'), 'Sponsor Loop');
    assert.strictEqual(engine.getTargetSceneForAction('unknown'), null);
  });

  it('should construct valid vMix HTTP API transition URLs', () => {
    const engine = new BroadcastAutomationEngine({
      isPro: () => true,
      type: 'vmix',
      vmixHost: '192.168.1.100',
      vmixPort: 8088
    });

    const url = engine.buildVmixTransitionUrl('Speaker Wide');
    assert.strictEqual(
      url,
      'http://192.168.1.100:8088/api/?Function=CutDirect&Input=' + encodeURIComponent('Speaker Wide')
    );
  });

  it('should construct valid OBS WebSocket v5 SetCurrentProgramScene request payloads', () => {
    const engine = new BroadcastAutomationEngine({ isPro: () => true });
    const payload = engine.buildObsSceneSwitchPayload('Keynote Main');

    assert.strictEqual(payload.op, 6); // Request
    assert.strictEqual(payload.d.requestType, 'SetCurrentProgramScene');
    assert.strictEqual(payload.d.requestData.sceneName, 'Keynote Main');
  });
});
