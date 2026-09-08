/**
 * js/timer-annotation.js - Smart Keynote Countdown Timer & Professional Annotation Suite
 * PDF Presenter Suite
 *
 * Implements:
 * 1. Smart Countdown Timer (Keynote Stopwatch & Pro Countdown Engine)
 *    - Modes: 'countup' (standard stopwatch) or 'countdown' (smart keynote timer)
 *    - Presets: 5m, 10m, 15m, 20m, 30m, 45m, 60m, or custom seconds
 *    - Phase tracking:
 *      * Normal (cyan/green) when remaining > 300s (5 min)
 *      * Warning (pulsing amber) when remaining <= 300s
 *      * Critical (pulsing red) when remaining <= 60s
 *      * Overtime: when remaining <= 0, flashing red +MM:SS count-up
 *    - Gating: countdown mode is Pro only; Free users retain count-up stopwatch.
 *
 * 2. Professional Annotation Suite (Multi-Color Pen + Semi-Transparent Highlighter)
 *    - Palette: Yellow (#eab308), Neon Green (#22c55e), Electric Blue (#38bdf8),
 *               Hot Pink (#ec4899), White (#ffffff)
 *    - Highlighter: broad brush (24px) with 0.35 alpha blending
 *    - Stroke widths: Fine (2px), Medium (5px), Thick (10px)
 *    - Gating: Multi-color & Highlighter are Pro only; Free users retain basic yellow pen + red laser.
 *    - PresentationSyncBus relay with color, alpha, width, and point coordinates.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TimerAnnotationEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & CONFIGURATION
  // =========================================================================
  const PALETTE = Object.freeze({
    YELLOW: '#eab308',
    NEON_GREEN: '#22c55e',
    ELECTRIC_BLUE: '#38bdf8',
    HOT_PINK: '#ec4899',
    WHITE: '#ffffff'
  });

  const PRESETS = Object.freeze({
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '20m': 1200,
    '30m': 1800,
    '45m': 2700,
    '60m': 3600
  });

  const STROKE_WIDTHS = Object.freeze({
    FINE: 2,
    MEDIUM: 5,
    THICK: 10,
    HIGHLIGHTER: 24
  });

  const HIGHLIGHTER_ALPHA = 0.35;
  const HIGHLIGHTER_WIDTH = 24;

  /**
   * Convert hex color string to rgba() CSS string
   */
  function hexToRgba(hex, alpha = 1.0) {
    if (!hex || typeof hex !== 'string') return `rgba(234, 179, 8, ${alpha})`;
    let clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    if (clean.length !== 6) return `rgba(234, 179, 8, ${alpha})`;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Format seconds to MM:SS or HH:MM:SS
   */
  function formatTime(totalSeconds, includePlus = false) {
    const sAbs = Math.abs(Math.floor(totalSeconds));
    const h = Math.floor(sAbs / 3600);
    const m = Math.floor((sAbs % 3600) / 60);
    const s = sAbs % 60;
    const prefix = includePlus ? '+' : '';
    if (h > 0) {
      return `${prefix}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${prefix}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // =========================================================================
  // SMART KEYNOTE COUNTDOWN TIMER
  // =========================================================================
  class SmartTimer {
    constructor(options = {}) {
      this.mode = options.mode || 'countup'; // 'countup' | 'countdown'
      this.duration = Number(options.duration) || 0; // target seconds
      this.elapsedSeconds = Number(options.elapsedSeconds) || 0;
      this.running = false;
      this.intervalId = null;
      this.listeners = new Set();
      this.onPhaseChange = options.onPhaseChange || null;
      this.onProRequired = options.onProRequired || null;
      this.currentPhase = 'normal';

      this._isProFn = typeof options.isPro === 'function'
        ? options.isPro
        : () => {
            if (typeof options.isPro === 'boolean') return options.isPro;
            if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function') {
              return window.UpgradeModal.isPro();
            }
            return false;
          };
    }

    isPro() {
      try {
        return Boolean(this._isProFn());
      } catch (e) {
        return false;
      }
    }

    setIsPro(isProOrFn) {
      if (typeof isProOrFn === 'function') {
        this._isProFn = isProOrFn;
      } else {
        this._isProFn = () => Boolean(isProOrFn);
      }
    }

    setMode(newMode) {
      const target = (newMode || 'countup').toLowerCase();
      if (target === 'countdown') {
        if (!this.isPro()) {
          this._handleProBlocked('countdown');
          return false;
        }
        this.mode = 'countdown';
      } else {
        this.mode = 'countup';
      }
      this.notifyChange();
      return true;
    }

    setDuration(seconds) {
      const num = Number(seconds);
      if (isNaN(num) || num < 0) return false;

      // Countdown duration is a Pro feature
      if (!this.isPro()) {
        this._handleProBlocked('countdown');
        return false;
      }

      this.duration = num;
      this.mode = 'countdown';
      this.elapsedSeconds = 0;
      this.notifyChange();
      return true;
    }

    setPreset(presetKey) {
      const s = PRESETS[presetKey];
      if (s !== undefined) {
        return this.setDuration(s);
      }
      return false;
    }

    start() {
      if (this.running) return;
      this.running = true;
      if (this.intervalId) clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        this.tick();
      }, 1000);
      this.notifyChange();
    }

    pause() {
      this.running = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.notifyChange();
    }

    reset() {
      this.pause();
      this.elapsedSeconds = 0;
      this.notifyChange();
    }

    tick() {
      this.elapsedSeconds++;
      const state = this.getState();
      if (state.phase !== this.currentPhase) {
        this.currentPhase = state.phase;
        if (typeof this.onPhaseChange === 'function') {
          this.onPhaseChange(this.currentPhase, state);
        }
      }
      this.notifyChange(state);
    }

    getState() {
      const isCountdown = this.mode === 'countdown';
      let remaining = 0;
      let isOvertime = false;
      let overtimeSeconds = 0;
      let phase = 'normal';
      let formatted = '';

      if (isCountdown && this.duration > 0) {
        const rawRemaining = this.duration - this.elapsedSeconds;
        if (rawRemaining <= 0) {
          isOvertime = true;
          overtimeSeconds = this.elapsedSeconds - this.duration; // >= 0
          remaining = 0;
          phase = 'overtime';
          formatted = `+${formatTime(overtimeSeconds)}`;
        } else {
          remaining = rawRemaining;
          isOvertime = false;
          overtimeSeconds = 0;
          if (remaining <= 60) {
            phase = 'critical';
          } else if (remaining <= 300) {
            phase = 'warning';
          } else {
            phase = 'normal';
          }
          formatted = formatTime(remaining);
        }
      } else {
        phase = 'normal';
        formatted = formatTime(this.elapsedSeconds);
      }

      return {
        timerRunning: this.running,
        timerMode: this.mode,
        timerSeconds: this.elapsedSeconds,
        timerDuration: this.duration,
        timerRemaining: remaining,
        rawRemaining: isCountdown ? (this.duration - this.elapsedSeconds) : 0,
        isOvertime,
        overtimeSeconds,
        phase,
        formatted
      };
    }

    _handleProBlocked(feature) {
      if (typeof this.onProRequired === 'function') {
        this.onProRequired(feature);
      } else if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.open === 'function') {
        window.UpgradeModal.open('timer');
      }
    }

    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyChange(providedState) {
      const st = providedState || this.getState();
      for (const fn of this.listeners) {
        try { fn(st); } catch (e) {}
      }
    }

    destroy() {
      this.pause();
      this.listeners.clear();
    }
  }

  // =========================================================================
  // PROFESSIONAL ANNOTATION SUITE
  // =========================================================================
  class AnnotationManager {
    constructor(options = {}) {
      this.syncBus = options.syncBus || null;
      this.activeTool = options.defaultTool || 'select'; // 'select' | 'laser' | 'pen' | 'highlighter'
      this.selectedColor = options.defaultColor || PALETTE.YELLOW;
      this.selectedWidth = options.defaultWidth || STROKE_WIDTHS.MEDIUM;
      this.isDrawing = false;
      this.currentStroke = [];
      this.allStrokes = [];
      this.onProRequired = options.onProRequired || null;
      this.listeners = new Set();

      this._isProFn = typeof options.isPro === 'function'
        ? options.isPro
        : () => {
            if (typeof options.isPro === 'boolean') return options.isPro;
            if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function') {
              return window.UpgradeModal.isPro();
            }
            return false;
          };
    }

    isPro() {
      try {
        return Boolean(this._isProFn());
      } catch (e) {
        return false;
      }
    }

    setIsPro(isProOrFn) {
      if (typeof isProOrFn === 'function') {
        this._isProFn = isProOrFn;
      } else {
        this._isProFn = () => Boolean(isProOrFn);
      }
    }

    setTool(tool) {
      const target = (tool || 'select').toLowerCase();
      if (target === 'highlighter') {
        if (!this.isPro()) {
          this._handleProBlocked('highlighter');
          return { success: false, error: 'PRO_REQUIRED', tool: this.activeTool };
        }
      }
      this.activeTool = target;
      this.notifyChange();
      return { success: true, tool: this.activeTool };
    }

    setColor(color) {
      if (!color) return { success: false, error: 'INVALID_COLOR' };
      const clean = color.toLowerCase();

      // Palette validation
      const validHexes = Object.values(PALETTE).map(c => c.toLowerCase());
      if (!validHexes.includes(clean)) {
        return { success: false, error: 'UNKNOWN_COLOR' };
      }

      // Free tier is strictly limited to Yellow (#eab308)
      if (clean !== PALETTE.YELLOW.toLowerCase() && !this.isPro()) {
        this._handleProBlocked('multi_color');
        return { success: false, error: 'PRO_REQUIRED', color: this.selectedColor };
      }

      this.selectedColor = color;
      this.notifyChange();
      return { success: true, color: this.selectedColor };
    }

    setWidth(width) {
      const num = Number(width);
      if (isNaN(num) || num <= 0) return { success: false, error: 'INVALID_WIDTH' };
      this.selectedWidth = num;
      this.notifyChange();
      return { success: true, width: this.selectedWidth };
    }

    getEffectiveStrokeProps() {
      const isHighlighter = this.activeTool === 'highlighter';
      return {
        color: this.selectedColor,
        alpha: isHighlighter ? HIGHLIGHTER_ALPHA : 1.0,
        width: isHighlighter ? HIGHLIGHTER_WIDTH : this.selectedWidth,
        tool: this.activeTool,
        rgba: hexToRgba(this.selectedColor, isHighlighter ? HIGHLIGHTER_ALPHA : 1.0)
      };
    }

    startStroke(point) {
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
      this.isDrawing = true;
      const props = this.getEffectiveStrokeProps();
      const stroke = {
        points: [{ x: point.x, y: point.y }],
        color: props.color,
        alpha: props.alpha,
        width: props.width,
        tool: props.tool,
        rgba: props.rgba
      };
      this.currentStroke = stroke.points;

      this.sendSync({
        type: 'PEN_DOWN',
        point: { x: point.x, y: point.y },
        color: props.color,
        alpha: props.alpha,
        width: props.width,
        tool: props.tool,
        rgba: props.rgba
      });

      return stroke;
    }

    addPoint(point) {
      if (!this.isDrawing || !point) return null;
      this.currentStroke.push({ x: point.x, y: point.y });
      const props = this.getEffectiveStrokeProps();

      this.sendSync({
        type: 'PEN_POINT',
        point: { x: point.x, y: point.y },
        color: props.color,
        alpha: props.alpha,
        width: props.width,
        tool: props.tool,
        rgba: props.rgba
      });

      return { x: point.x, y: point.y };
    }

    endStroke() {
      if (!this.isDrawing) return null;
      this.isDrawing = false;
      const props = this.getEffectiveStrokeProps();
      let completedStroke = null;

      if (this.currentStroke.length > 0) {
        completedStroke = {
          points: [...this.currentStroke],
          color: props.color,
          alpha: props.alpha,
          width: props.width,
          tool: props.tool,
          rgba: props.rgba
        };
        this.allStrokes.push(completedStroke);
      }
      this.currentStroke = [];

      this.sendSync({
        type: 'PEN_UP',
        color: props.color,
        alpha: props.alpha,
        width: props.width,
        tool: props.tool
      });

      return completedStroke;
    }

    clearAnnotations() {
      this.allStrokes = [];
      this.currentStroke = [];
      this.sendSync({ type: 'CLEAR_PEN' });
      this.notifyChange();
    }

    sendSync(msg) {
      if (this.syncBus && typeof this.syncBus.send === 'function') {
        try {
          this.syncBus.send(msg);
        } catch (e) {
          console.warn('[TimerAnnotationEngine] syncBus.send error:', e);
        }
      }
    }

    _handleProBlocked(feature) {
      if (typeof this.onProRequired === 'function') {
        this.onProRequired(feature);
      } else if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.open === 'function') {
        window.UpgradeModal.open(feature === 'highlighter' ? 'highlighter' : 'multi_color');
      }
    }

    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyChange() {
      const state = {
        activeTool: this.activeTool,
        selectedColor: this.selectedColor,
        selectedWidth: this.selectedWidth,
        strokeCount: this.allStrokes.length,
        isDrawing: this.isDrawing
      };
      for (const fn of this.listeners) {
        try { fn(state); } catch (e) {}
      }
    }
  }

  // =========================================================================
  // UNIFIED ENGINE CLASS (MAIN EXPORT)
  // =========================================================================
  class TimerAnnotationEngine {
    constructor(options = {}) {
      this.options = options;
      this.syncBus = options.syncBus || null;

      const isProShared = typeof options.isPro === 'function'
        ? options.isPro
        : () => {
            if (typeof options.isPro === 'boolean') return options.isPro;
            if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function') {
              return window.UpgradeModal.isPro();
            }
            return false;
          };

      this.timer = new SmartTimer({
        mode: options.timerMode || 'countup',
        duration: options.timerDuration || 0,
        elapsedSeconds: options.timerSeconds || 0,
        isPro: isProShared,
        onProRequired: options.onProRequired,
        onPhaseChange: options.onPhaseChange
      });

      this.annotations = new AnnotationManager({
        syncBus: this.syncBus,
        isPro: isProShared,
        defaultTool: options.defaultTool || 'select',
        defaultColor: options.defaultColor || PALETTE.YELLOW,
        defaultWidth: options.defaultWidth || STROKE_WIDTHS.MEDIUM,
        onProRequired: options.onProRequired
      });
    }

    // Static Constants & Helpers
    static PALETTE = PALETTE;
    static PRESETS = PRESETS;
    static STROKE_WIDTHS = STROKE_WIDTHS;
    static HIGHLIGHTER_ALPHA = HIGHLIGHTER_ALPHA;
    static HIGHLIGHTER_WIDTH = HIGHLIGHTER_WIDTH;
    static SmartTimer = SmartTimer;
    static AnnotationManager = AnnotationManager;
    static hexToRgba = hexToRgba;
    static formatTime = formatTime;

    // Timer Delegations
    startTimer() { return this.timer.start(); }
    pauseTimer() { return this.timer.pause(); }
    resetTimer() { return this.timer.reset(); }
    setTimerMode(mode) { return this.timer.setMode(mode); }
    setDuration(seconds) { return this.timer.setDuration(seconds); }
    setPreset(presetKey) { return this.timer.setPreset(presetKey); }
    getTimerState() { return this.timer.getState(); }
    tick() { return this.timer.tick(); }

    // Direct aliases on engine
    start() { return this.startTimer(); }
    pause() { return this.pauseTimer(); }
    reset() { return this.resetTimer(); }
    getState() { return this.getTimerState(); }

    // Annotation Delegations
    setTool(tool) { return this.annotations.setTool(tool); }
    setColor(color) { return this.annotations.setColor(color); }
    setWidth(width) { return this.annotations.setWidth(width); }
    getTool() { return this.annotations.activeTool; }
    getColor() { return this.annotations.selectedColor; }
    getWidth() { return this.annotations.selectedWidth; }
    startStroke(point) { return this.annotations.startStroke(point); }
    addPoint(point) { return this.annotations.addPoint(point); }
    endStroke() { return this.annotations.endStroke(); }
    clearAnnotations() { return this.annotations.clearAnnotations(); }
    getStrokes() { return this.annotations.allStrokes; }
    getCurrentStroke() { return this.annotations.currentStroke; }

    // Entitlement helpers
    setIsPro(isProOrFn) {
      this.timer.setIsPro(isProOrFn);
      this.annotations.setIsPro(isProOrFn);
    }
  }

  return TimerAnnotationEngine;
});
