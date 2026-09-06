// tests/coordinate-scaling.test.js - Unit tests for 1920x1080 virtual coordinate scaling
const { test, describe } = require('node:test');
const assert = require('node:assert');

describe('Canvas Virtual Coordinate System & Aspect Ratio Math', () => {
  const BASE_W = 1920;
  const BASE_H = 1080;

  function calculateTransform(targetWidth, targetHeight) {
    const scale = Math.min(targetWidth / BASE_W, targetHeight / BASE_H);
    const offsetX = (targetWidth - BASE_W * scale) / 2;
    const offsetY = (targetHeight - BASE_H * scale) / 2;
    const renderedW = BASE_W * scale;
    const renderedH = BASE_H * scale;

    return {
      scale,
      offsetX,
      offsetY,
      renderedW,
      renderedH
    };
  }

  test('16:9 exact matches (1080p, 720p, 4K, 540p) have zero offset and exact fill', () => {
    const resolutions = [
      { w: 1920, h: 1080, expectedScale: 1.0 },
      { w: 1280, h: 720, expectedScale: 1280 / 1920 },
      { w: 3840, h: 2160, expectedScale: 2.0 },
      { w: 960, h: 540, expectedScale: 0.5 },
      { w: 480, h: 270, expectedScale: 0.25 }
    ];

    for (const res of resolutions) {
      const t = calculateTransform(res.w, res.h);
      assert.strictEqual(Math.abs(t.scale - res.expectedScale) < 0.0001, true, `Scale for ${res.w}x${res.h}`);
      assert.strictEqual(Math.abs(t.offsetX) < 0.0001, true, `OffsetX for ${res.w}x${res.h}`);
      assert.strictEqual(Math.abs(t.offsetY) < 0.0001, true, `OffsetY for ${res.w}x${res.h}`);
      assert.strictEqual(Math.abs(t.renderedW - res.w) < 0.0001, true, `Width match for ${res.w}x${res.h}`);
      assert.strictEqual(Math.abs(t.renderedH - res.h) < 0.0001, true, `Height match for ${res.w}x${res.h}`);
    }
  });

  test('16:10 screens (1920x1200) pillarbox / letterbox with valid positive vertical offset', () => {
    const t = calculateTransform(1920, 1200);
    assert.strictEqual(t.scale, 1.0);
    assert.strictEqual(t.offsetX, 0);
    assert.strictEqual(t.offsetY, 60); // 1200 - 1080 = 120 / 2 = 60
    assert.strictEqual(t.renderedW, 1920);
    assert.strictEqual(t.renderedH, 1080);
    assert.strictEqual(t.offsetY * 2 + t.renderedH, 1200);
  });

  test('4:3 legacy projectors (1024x768) pillarbox / letterbox without clipping', () => {
    const t = calculateTransform(1024, 768);
    // 1024 / 1920 = 0.5333, 768 / 1080 = 0.7111
    assert.strictEqual(t.scale, 1024 / 1920);
    assert.strictEqual(t.offsetX, 0);
    assert.strictEqual(t.offsetY > 0, true);
    assert.strictEqual(t.renderedW, 1024);
    assert.strictEqual(t.renderedH < 768, true);
    assert.strictEqual(t.offsetY * 2 + t.renderedH, 768);
  });

  test('21:9 ultrawide monitors (2560x1080) pillarbox with horizontal offset', () => {
    const t = calculateTransform(2560, 1080);
    assert.strictEqual(t.scale, 1.0);
    assert.strictEqual(t.offsetY, 0);
    assert.strictEqual(t.offsetX, (2560 - 1920) / 2); // 320px black bars on each side
    assert.strictEqual(t.renderedW, 1920);
    assert.strictEqual(t.renderedH, 1080);
    assert.strictEqual(t.offsetX * 2 + t.renderedW, 2560);
  });

  test('Small thumbnail sizes (160x90, 240x135, 180x101) scale correctly without negative bounds', () => {
    const thumbs = [
      { w: 160, h: 90 },
      { w: 240, h: 135 },
      { w: 180, h: 101 }
    ];

    for (const thumb of thumbs) {
      const t = calculateTransform(thumb.w, thumb.h);
      assert.strictEqual(t.scale > 0, true);
      assert.strictEqual(Number.isFinite(t.scale), true);
      assert.strictEqual(t.offsetX >= 0, true);
      assert.strictEqual(t.offsetY >= 0, true);
      assert.strictEqual(t.renderedW <= thumb.w + 0.01, true);
      assert.strictEqual(t.renderedH <= thumb.h + 0.01, true);
    }
  });

  test('Coordinates at virtual boundary (1920, 1080) map strictly within target canvas', () => {
    const testCases = [
      { w: 960, h: 540 },
      { w: 1280, h: 800 },
      { w: 1024, h: 768 },
      { w: 320, h: 180 }
    ];

    for (const tc of testCases) {
      const t = calculateTransform(tc.w, tc.h);
      
      // Test virtual point (0, 0)
      const x0 = t.offsetX + 0 * t.scale;
      const y0 = t.offsetY + 0 * t.scale;
      assert.strictEqual(x0 >= 0, true);
      assert.strictEqual(y0 >= 0, true);

      // Test virtual point (1920, 1080)
      const xMax = t.offsetX + 1920 * t.scale;
      const yMax = t.offsetY + 1080 * t.scale;
      assert.strictEqual(xMax <= tc.w + 0.001, true);
      assert.strictEqual(yMax <= tc.h + 0.001, true);

      // Test slide 2 card 3 boundary (X: 1220 to 1740, Y: 300 to 880)
      const card3Right = t.offsetX + 1740 * t.scale;
      const card3Bottom = t.offsetY + 880 * t.scale;
      assert.strictEqual(card3Right <= tc.w + 0.001, true, `Card 3 right within ${tc.w}x${tc.h}`);
      assert.strictEqual(card3Bottom <= tc.h + 0.001, true, `Card 3 bottom within ${tc.w}x${tc.h}`);
    }
  });
});
