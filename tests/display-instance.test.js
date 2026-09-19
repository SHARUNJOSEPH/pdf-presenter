/**
 * tests/display-instance.test.js
 * Unit test suite for HDMI Display Hotplug Detection and Single-Instance Application Lock
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('HDMI Display Hotplug & Single-Instance Lock Suite', () => {

  // =========================================================================
  // 1. DISPLAY TOPOLOGY & HDMI IDENTIFICATION
  // =========================================================================
  describe('Display Topology & HDMI Identification', () => {
    function mapDisplays(displays, primaryId) {
      return displays.map((d, index) => {
        const isPrimary = d.id === primaryId;
        const res = `${d.bounds.width}x${d.bounds.height}`;
        let label = d.label || `Display ${index + 1}`;
        if (!d.label) {
          label = isPrimary ? `Built-in Screen (${res})` : `External Display (${res})`;
        }
        return {
          id: d.id,
          label: label,
          bounds: d.bounds,
          isPrimary: isPrimary,
          isExternal: !isPrimary
        };
      });
    }

    it('should correctly classify single primary laptop display', () => {
      const rawDisplays = [
        { id: 1, bounds: { width: 1920, height: 1080 } }
      ];
      const mapped = mapDisplays(rawDisplays, 1);

      assert.strictEqual(mapped.length, 1);
      assert.strictEqual(mapped[0].isPrimary, true);
      assert.strictEqual(mapped[0].isExternal, false);
      assert.strictEqual(mapped[0].label, 'Built-in Screen (1920x1080)');
    });

    it('should identify external HDMI projector when plugged in', () => {
      const rawDisplays = [
        { id: 1, bounds: { width: 1920, height: 1080 } },
        { id: 2, bounds: { width: 3840, height: 2160 }, label: 'Optoma 4K Projector' }
      ];
      const mapped = mapDisplays(rawDisplays, 1);

      assert.strictEqual(mapped.length, 2);
      assert.strictEqual(mapped[0].isPrimary, true);
      assert.strictEqual(mapped[1].isPrimary, false);
      assert.strictEqual(mapped[1].isExternal, true);
      assert.strictEqual(mapped[1].label, 'Optoma 4K Projector');
    });
  });

  // =========================================================================
  // 2. HDMI HOTPLUG AUTO-SELECTION & TOPOLOGY TRANSITIONS
  // =========================================================================
  describe('HDMI Hotplug Auto-Selection Logic', () => {
    function determineAudienceTarget(currentDisplays, previousCount, prevSelectedId) {
      const external = currentDisplays.find(d => !d.isPrimary);
      const isNewlyAdded = previousCount > 0 && currentDisplays.length > previousCount;

      if (isNewlyAdded && external) {
        return { targetId: external.id, autoSelected: true, reason: 'hdmi-hotplug-autoselect' };
      }

      if (prevSelectedId && currentDisplays.some(d => d.id === prevSelectedId)) {
        return { targetId: prevSelectedId, autoSelected: false, reason: 'preserve-selection' };
      }

      if (external) {
        return { targetId: external.id, autoSelected: true, reason: 'default-external' };
      }

      return { targetId: currentDisplays[0].id, autoSelected: false, reason: 'fallback-primary' };
    }

    it('should automatically select newly plugged HDMI display when count increases from 1 to 2', () => {
      const initialDisplays = [{ id: 1, isPrimary: true }];
      const hotplugDisplays = [
        { id: 1, isPrimary: true },
        { id: 2, isPrimary: false, label: 'HDMI Conference Screen' }
      ];

      const result = determineAudienceTarget(hotplugDisplays, initialDisplays.length, 1);
      assert.strictEqual(result.targetId, 2);
      assert.strictEqual(result.autoSelected, true);
      assert.strictEqual(result.reason, 'hdmi-hotplug-autoselect');
    });

    it('should safely fall back to primary screen if external monitor is disconnected', () => {
      const disconnectedDisplays = [{ id: 1, isPrimary: true }];
      const previousSelectedId = 2; // ID of disconnected HDMI screen

      const result = determineAudienceTarget(disconnectedDisplays, 2, previousSelectedId);
      assert.strictEqual(result.targetId, 1);
      assert.strictEqual(result.autoSelected, false);
      assert.strictEqual(result.reason, 'fallback-primary');
    });
  });

  // =========================================================================
  // 3. BROADCAST DISPLAY CHANGE EVENT GENERATOR
  // =========================================================================
  describe('Display Change Broadcaster Payload', () => {
    function createBroadcastPayload(changeType, rawDisplays, detail = {}) {
      return {
        changeType,
        displays: rawDisplays.map(d => ({
          id: d.id,
          bounds: d.bounds,
          isPrimary: Boolean(d.isPrimary)
        })),
        count: rawDisplays.length,
        detail,
        timestamp: Date.now()
      };
    }

    it('should format display-added payload with new display details', () => {
      const displays = [
        { id: 1, bounds: { width: 1920, height: 1080 }, isPrimary: true },
        { id: 2, bounds: { width: 1920, height: 1080 }, isPrimary: false }
      ];

      const payload = createBroadcastPayload('display-added', displays, { displayId: 2 });
      assert.strictEqual(payload.changeType, 'display-added');
      assert.strictEqual(payload.count, 2);
      assert.strictEqual(payload.detail.displayId, 2);
      assert.strictEqual(payload.displays[1].id, 2);
    });

    it('should format display-removed payload gracefully', () => {
      const displays = [
        { id: 1, bounds: { width: 1920, height: 1080 }, isPrimary: true }
      ];

      const payload = createBroadcastPayload('display-removed', displays, { displayId: 2 });
      assert.strictEqual(payload.changeType, 'display-removed');
      assert.strictEqual(payload.count, 1);
      assert.strictEqual(payload.detail.displayId, 2);
    });
  });

  // =========================================================================
  // 4. SINGLE-INSTANCE LOCK & WINDOW RESTORE STATE
  // =========================================================================
  describe('Single-Instance Lock & Window Restore Behavior', () => {
    class MockWindowManager {
      constructor() {
        this.windows = {
          launcher: { isDestroyed: () => false, isMinimized: () => true, restored: false, shown: false, focused: false },
          presenter: null
        };
      }

      handleSecondInstance() {
        const activeWin = this.windows.presenter || this.windows.launcher;
        if (activeWin && !activeWin.isDestroyed()) {
          if (activeWin.isMinimized()) {
            activeWin.restored = true;
          }
          activeWin.shown = true;
          activeWin.focused = true;
          return { handled: true, restored: activeWin.restored };
        }
        return { handled: false };
      }
    }

    it('should restore and focus minimized window when second instance is launched', () => {
      const manager = new MockWindowManager();
      const res = manager.handleSecondInstance();

      assert.strictEqual(res.handled, true);
      assert.strictEqual(res.restored, true);
      assert.strictEqual(manager.windows.launcher.shown, true);
      assert.strictEqual(manager.windows.launcher.focused, true);
    });

    it('should reject secondary process lock if primary instance is active', () => {
      let primaryInstanceRunning = true;
      function requestLock() {
        if (primaryInstanceRunning) return false;
        primaryInstanceRunning = true;
        return true;
      }

      const secondaryAttempt = requestLock();
      assert.strictEqual(secondaryAttempt, false, 'Secondary instance must be denied lock');
    });
  });

});
