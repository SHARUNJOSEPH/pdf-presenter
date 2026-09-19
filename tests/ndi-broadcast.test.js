/**
 * tests/ndi-broadcast.test.js
 * Unit test suite for NDI® 5/6 & IP Video Network Broadcast Engine
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const NdiBroadcastEngine = require('../js/ndi-engine.js');

describe('NdiBroadcastEngine Unit Tests', () => {
  it('should initialize with default broadcast configuration', () => {
    const engine = new NdiBroadcastEngine({ isPro: () => true });
    const state = engine.getState();

    assert.strictEqual(state.isBroadcasting, false);
    assert.strictEqual(state.resolution, '1080p');
    assert.strictEqual(state.framerate, 30);
    assert.strictEqual(state.framesSent, 0);
  });

  it('should map standard resolutions to pixel dimensions', () => {
    const engine = new NdiBroadcastEngine({ isPro: () => true });
    
    assert.deepStrictEqual(engine.resolutionMap['720p'], { width: 1280, height: 720 });
    assert.deepStrictEqual(engine.resolutionMap['1080p'], { width: 1920, height: 1080 });
    assert.deepStrictEqual(engine.resolutionMap['4k'], { width: 3840, height: 2160 });
  });

  it('should enforce Pro entitlement gating on broadcast start', async () => {
    let proRequested = false;
    const freeEngine = new NdiBroadcastEngine({
      isPro: () => false,
      onProRequired: () => { proRequested = true; }
    });

    const result = await freeEngine.startBroadcast();
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'PRO_REQUIRED');
    assert.strictEqual(proRequested, true);
    assert.strictEqual(freeEngine.state.isBroadcasting, false);
  });

  it('should allow broadcast start when Pro entitlement is verified', async () => {
    const proEngine = new NdiBroadcastEngine({ isPro: () => true });
    const result = await proEngine.startBroadcast();

    assert.strictEqual(result.success, true);
    assert.strictEqual(proEngine.state.isBroadcasting, true);

    await proEngine.stopBroadcast();
    assert.strictEqual(proEngine.state.isBroadcasting, false);
  });

  it('should clamp framerate within valid bounds (1 - 60 fps)', () => {
    const engine = new NdiBroadcastEngine({ isPro: () => true });
    
    engine.setFramerate(120);
    assert.strictEqual(engine.state.framerate, 60);

    engine.setFramerate(0);
    assert.strictEqual(engine.state.framerate, 1);

    engine.setFramerate(45);
    assert.strictEqual(engine.state.framerate, 45);
  });

  it('should track frames sent through the broadcast pipeline', () => {
    const engine = new NdiBroadcastEngine({ isPro: () => true });
    engine.state.isBroadcasting = true;

    const mockFrame = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
    engine.sendFrame(mockFrame, 'program');

    assert.strictEqual(engine.state.framesSent, 1);
    assert.ok(engine.state.lastFrameTimestamp > 0);
  });
});
