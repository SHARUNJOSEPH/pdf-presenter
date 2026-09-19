/**
 * js/spotlight.js
 * Cinematic Spotlight & Slide Dimming Focus Mode Engine
 * Highlights specific areas on slides with a smooth radial spotlight beam
 * while dimming the background to guide audience visual attention.
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpotlightEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  class SpotlightEngine {
    constructor(options = {}) {
      this.syncBus = options.syncBus || null;
      this.isPro = typeof options.isPro === 'function' ? options.isPro : () => true;
      this.onProRequired = options.onProRequired || null;

      // Spotlight State
      this.state = {
        enabled: false,
        x: 0.5, // Normalized 0.0 to 1.0
        y: 0.5,
        radius: options.radius || 150, // pixels
        dimOpacity: options.dimOpacity || 0.75, // 0.0 to 1.0
        feather: options.feather || 30 // edge feathering in px
      };

      this._targetX = 0.5;
      this._targetY = 0.5;
      this._animFrame = null;
    }

    _checkProGate() {
      if (!this.isPro()) {
        if (typeof this.onProRequired === 'function') {
          this.onProRequired('Cinematic Spotlight');
        }
        return {
          success: false,
          error: 'PRO_REQUIRED',
          message: 'Cinematic Spotlight is an Enterprise Pro feature. Upgrade to unlock.'
        };
      }
      return null;
    }

    /**
     * Toggle Spotlight Mode
     */
    toggle(forcedState) {
      const gate = this._checkProGate();
      if (gate) return gate;

      this.state.enabled = (forcedState !== undefined) ? Boolean(forcedState) : !this.state.enabled;

      if (this.syncBus && typeof this.syncBus.emit === 'function') {
        this.syncBus.emit('SPOTLIGHT_TOGGLE', {
          enabled: this.state.enabled,
          state: this.getState()
        });
      }

      return { success: true, enabled: this.state.enabled };
    }

    /**
     * Update Spotlight Target Position (normalized 0.0 to 1.0)
     */
    setPosition(normalizedX, normalizedY, broadcast = true) {
      if (!this.state.enabled) return;

      this.state.x = Math.max(0, Math.min(1, Number(normalizedX) || 0));
      this.state.y = Math.max(0, Math.min(1, Number(normalizedY) || 0));

      if (broadcast && this.syncBus && typeof this.syncBus.emit === 'function') {
        this.syncBus.emit('SPOTLIGHT_MOVE', {
          x: this.state.x,
          y: this.state.y
        });
      }
    }

    /**
     * Set Spotlight Radius (in pixels)
     */
    setRadius(radius) {
      const gate = this._checkProGate();
      if (gate) return gate;

      this.state.radius = Math.max(50, Math.min(400, Number(radius) || 150));
      if (this.syncBus && typeof this.syncBus.emit === 'function') {
        this.syncBus.emit('SPOTLIGHT_CONFIG', this.getState());
      }
    }

    /**
     * Render Spotlight Mask onto a Canvas Context
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     */
    render(ctx, width, height) {
      if (!this.state.enabled || !ctx) return;

      const px = this.state.x * width;
      const py = this.state.y * height;
      const radius = this.state.radius;
      const feather = this.state.feather;

      ctx.save();

      // Create dim background mask with clear radial spotlight hole
      const gradient = ctx.createRadialGradient(
        px, py, Math.max(0, radius - feather),
        px, py, radius + feather
      );

      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.7, `rgba(0, 0, 0, ${this.state.dimOpacity * 0.5})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, ${this.state.dimOpacity})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Subtle circular ring border around spotlight
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.restore();
    }

    getState() {
      return { ...this.state };
    }
  }

  return SpotlightEngine;
}));
