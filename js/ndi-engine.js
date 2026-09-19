/**
 * js/ndi-engine.js
 * Professional NDI® 5/6 & IP Video Broadcast Engine
 * Streams low-latency presentation program video and transparent alpha key overlays
 * over local IP networks to OBS Studio, vMix, TriCaster, and broadcast switchers.
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NdiBroadcastEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {

  class NdiBroadcastEngine {
    constructor(options = {}) {
      this.syncBus = options.syncBus || null;
      this.isPro = typeof options.isPro === 'function' ? options.isPro : () => true;
      this.onProRequired = options.onProRequired || null;

      // Broadcast Configuration State
      this.state = {
        isBroadcasting: false,
        programSourceName: 'PDF Presenter - Program',
        alphaSourceName: 'PDF Presenter - Alpha Overlay',
        resolution: options.resolution || '1080p', // '720p', '1080p', '4k'
        framerate: options.framerate || 30, // 30, 60
        streamQuality: options.streamQuality || 0.85, // 0.1 to 1.0 (JPEG compression)
        port: options.port || 3000,
        activeClients: 0,
        lastFrameTimestamp: 0,
        framesSent: 0,
        fpsActual: 0,
        ndiBridgeConnected: false
      };

      this.resolutionMap = {
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
        '4k': { width: 3840, height: 2160 }
      };

      this._frameInterval = null;
      this._fpsTracker = { count: 0, lastCheck: Date.now() };
    }

    /**
     * Check Pro Entitlement
     */
    _checkProGate(featureName = 'NDI IP Video Broadcast') {
      if (!this.isPro()) {
        if (typeof this.onProRequired === 'function') {
          this.onProRequired(featureName);
        }
        return {
          success: false,
          error: 'PRO_REQUIRED',
          message: `${featureName} is an Enterprise Pro feature. Upgrade to unlock NDI network broadcast.`
        };
      }
      return null;
    }

    /**
     * Start NDI / IP Broadcast Stream
     */
    startBroadcast(config = {}) {
      const gate = this._checkProGate('NDI IP Video Broadcast');
      if (gate) return gate;

      if (config.resolution && this.resolutionMap[config.resolution]) {
        this.state.resolution = config.resolution;
      }
      if (config.framerate && (config.framerate === 30 || config.framerate === 60)) {
        this.state.framerate = config.framerate;
      }
      if (config.programSourceName) this.state.programSourceName = String(config.programSourceName).trim();
      if (config.alphaSourceName) this.state.alphaSourceName = String(config.alphaSourceName).trim();

      this.state.isBroadcasting = true;

      // Broadcast state update across syncBus
      if (this.syncBus && typeof this.syncBus.emit === 'function') {
        this.syncBus.emit('NDI_BROADCAST_STATE', {
          isBroadcasting: true,
          config: this.getConfig()
        });
      }

      return {
        success: true,
        message: 'NDI IP Broadcast started',
        state: this.getState()
      };
    }

    /**
     * Stop NDI / IP Broadcast Stream
     */
    stopBroadcast() {
      this.state.isBroadcasting = false;
      this.state.fpsActual = 0;

      if (this._frameInterval) {
        clearInterval(this._frameInterval);
        this._frameInterval = null;
      }

      if (this.syncBus && typeof this.syncBus.emit === 'function') {
        this.syncBus.emit('NDI_BROADCAST_STATE', {
          isBroadcasting: false,
          config: this.getConfig()
        });
      }

      return {
        success: true,
        message: 'NDI IP Broadcast stopped',
        state: this.getState()
      };
    }

    /**
     * Set target broadcast framerate (clamped between 1 and 60 fps)
     */
    setFramerate(fps) {
      const parsed = parseInt(fps, 10);
      const clamped = Math.max(1, Math.min(60, isNaN(parsed) ? 30 : parsed));
      this.state.framerate = clamped;
      return clamped;
    }

    /**
     * Set target broadcast resolution
     */
    setResolution(resolution) {
      if (this.resolutionMap[resolution]) {
        this.state.resolution = resolution;
        return true;
      }
      return false;
    }

    /**
     * Capture and dispatch a frame buffer from a canvas or data URL
     * @param {HTMLCanvasElement|string} canvas
     * @param {'program'|'alpha'} channel
     */
    sendFrame(canvas, channel = 'program') {
      if (!this.state.isBroadcasting || !canvas) return;

      try {
        const quality = this.state.streamQuality;
        const mimeType = channel === 'alpha' ? 'image/png' : 'image/jpeg';
        let dataUrl = null;

        if (typeof canvas === 'string') {
          dataUrl = canvas;
        } else if (typeof canvas.toDataURL === 'function') {
          dataUrl = canvas.toDataURL(mimeType, quality);
        }

        if (!dataUrl) return;

        this.state.framesSent++;
        this.state.lastFrameTimestamp = Date.now();

        // Track live FPS
        this._fpsTracker.count++;
        const now = Date.now();
        if (now - this._fpsTracker.lastCheck >= 1000) {
          this.state.fpsActual = this._fpsTracker.count;
          this._fpsTracker.count = 0;
          this._fpsTracker.lastCheck = now;
        }

        // Send frame to local broadcast gateway
        if (typeof fetch !== 'undefined') {
          fetch(`http://localhost:${this.state.port}/api/stream/frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channel: channel,
              dataUrl: dataUrl,
              timestamp: this.state.lastFrameTimestamp
            })
          }).catch(() => {});
        }
      } catch (err) {
        // Frame dropped silently in high-framerate loop
      }
    }

    /**
     * Get stream endpoints for external broadcast switchers (vMix, OBS Studio)
     */
    getStreamUrls(hostname = 'localhost') {
      const port = this.state.port;
      return {
        programMjpeg: `http://${hostname}:${port}/api/stream/program.mjpg`,
        alphaMjpeg: `http://${hostname}:${port}/api/stream/alpha.mjpg`,
        programSnapshot: `http://${hostname}:${port}/api/stream/program/snapshot`,
        alphaSnapshot: `http://${hostname}:${port}/api/stream/alpha/snapshot`,
        ndiDiscoveryUri: `ndi://${hostname}/${encodeURIComponent(this.state.programSourceName)}`,
        ndiAlphaDiscoveryUri: `ndi://${hostname}/${encodeURIComponent(this.state.alphaSourceName)}`
      };
    }

    /**
     * Get current engine state
     */
    getState() {
      return { ...this.state };
    }

    /**
     * Get current configuration
     */
    getConfig() {
      return {
        isBroadcasting: this.state.isBroadcasting,
        programSourceName: this.state.programSourceName,
        alphaSourceName: this.state.alphaSourceName,
        resolution: this.state.resolution,
        framerate: this.state.framerate,
        dimensions: this.resolutionMap[this.state.resolution] || { width: 1920, height: 1080 }
      };
    }
  }

  return NdiBroadcastEngine;
}));
