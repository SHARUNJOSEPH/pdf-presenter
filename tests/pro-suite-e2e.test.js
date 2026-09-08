// tests/pro-suite-e2e.test.js - Unified Comprehensive Test for All 7 Pro Features
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WatermarkBannerEngine = require('../js/watermark-banner.js');
const TimerAnnotationEngine = require('../js/timer-annotation.js');
const PlaylistMetricsEngine = require('../js/playlist-metrics.js');
const licenseManager = require('../js/license-manager.js');

describe('Unified Enterprise Pro Suite - All 7 Features Integration', () => {
  let mockSyncBus;
  let broadcastEvents;

  beforeEach(() => {
    broadcastEvents = [];
    mockSyncBus = {
      send: (evt) => broadcastEvents.push(evt),
      on: () => {}
    };
    licenseManager.resetToFree();
  });

  // ---------------------------------------------------------------------------
  // Feature 1: Live Watermark & Event Branding Engine
  // ---------------------------------------------------------------------------
  describe('Feature 1: Live Watermark & Event Branding Engine', () => {
    it('configures and broadcasts custom text and logo watermarks', () => {
      const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
      engine.syncBus = mockSyncBus;

      engine.setWatermark({
        enabled: true,
        text: 'ACME KEYNOTE 2026',
        position: 'bottom-right',
        opacity: 0.85,
        scale: 1.1
      }, true);

      assert.equal(engine.watermarkState.enabled, true);
      assert.equal(engine.watermarkState.text, 'ACME KEYNOTE 2026');
      assert.equal(engine.watermarkState.position, 'bottom-right');
      assert.equal(engine.watermarkState.opacity, 0.85);

      const evt = broadcastEvents.find(e => e.type === 'SET_WATERMARK');
      assert.ok(evt);
      assert.equal(evt.config.text, 'ACME KEYNOTE 2026');
      assert.equal(evt.config.position, 'bottom-right');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 2: Smart Keynote Countdown with Overtime Flashing
  // ---------------------------------------------------------------------------
  describe('Feature 2: Smart Keynote Countdown with Overtime Flashing', () => {
    it('manages keynote presets, phase warnings, and overtime calculation', () => {
      const engine = new TimerAnnotationEngine({ isPro: true, syncBus: mockSyncBus });

      // Test preset setting
      assert.equal(engine.setPreset('15m'), true);
      let state = engine.getTimerState();
      assert.equal(state.timerDuration, 900);
      assert.equal(state.phase, 'normal');

      // Test warning phase (<= 300s)
      engine.timer.elapsedSeconds = 650; // 900 - 650 = 250s remaining
      state = engine.getTimerState();
      assert.equal(state.phase, 'warning');

      // Test critical phase (<= 60s)
      engine.timer.elapsedSeconds = 850; // 900 - 850 = 50s remaining
      state = engine.getTimerState();
      assert.equal(state.phase, 'critical');

      // Test overtime phase (<= 0s)
      engine.timer.elapsedSeconds = 930; // 30 seconds overtime
      state = engine.getTimerState();
      assert.equal(state.phase, 'overtime');
      assert.equal(state.isOvertime, true);
      assert.equal(state.overtimeSeconds, 30);
      assert.equal(state.formatted, '+00:30');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 3: Professional Annotation Suite (Palette + Highlighter)
  // ---------------------------------------------------------------------------
  describe('Feature 3: Professional Annotation Suite', () => {
    it('supports 5-color neon palette, highlighter with 0.35 alpha, and stroke widths', () => {
      const engine = new TimerAnnotationEngine({ isPro: true, syncBus: mockSyncBus });

      // Verify colors
      assert.equal(engine.setColor('#22c55e').success, true);
      assert.equal(engine.getColor(), '#22c55e');

      // Verify stroke widths
      assert.equal(engine.setWidth(10).success, true);
      assert.equal(engine.getWidth(), 10);

      // Verify highlighter mode
      assert.equal(engine.setTool('highlighter').success, true);
      assert.equal(engine.getTool(), 'highlighter');

      // Start highlighter stroke and verify sync event with alpha 0.35
      broadcastEvents = [];
      engine.startStroke({ x: 0.2, y: 0.3 });
      const downEvt = broadcastEvents.find(e => e.type === 'PEN_DOWN');
      assert.ok(downEvt);
      assert.equal(downEvt.alpha, 0.35);
      assert.equal(downEvt.width, 24);
      assert.equal(downEvt.tool, 'highlighter');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 4: Live Audience Lower-Third Ticker Banner
  // ---------------------------------------------------------------------------
  describe('Feature 4: Live Audience Lower-Third Ticker Banner', () => {
    it('broadcasts sticky and timed lower-third banners to audience display', () => {
      const engine = new WatermarkBannerEngine.WatermarkBannerEngine();
      engine.syncBus = mockSyncBus;

      engine.showBanner('📢 Welcome to World Tech Summit 2026', 0);
      assert.equal(engine.bannerState.active, true);
      assert.equal(engine.bannerState.displayMode, 'sticky');

      let evt = broadcastEvents.find(e => e.type === 'SHOW_BANNER');
      assert.ok(evt);
      assert.equal(evt.message, '📢 Welcome to World Tech Summit 2026');

      engine.hideBanner();
      assert.equal(engine.bannerState.active, false);
      evt = broadcastEvents.find(e => e.type === 'HIDE_BANNER');
      assert.ok(evt);
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 5: Multi-Deck Conference Playlist (Speaker Queue)
  // ---------------------------------------------------------------------------
  describe('Feature 5: Multi-Deck Conference Playlist', () => {
    it('queues multiple decks and switches active deck seamlessly', async () => {
      const engine = new PlaylistMetricsEngine({ isPro: true, syncBus: mockSyncBus });

      engine.addDeck({ id: 'deck_1', title: 'Opening Keynote', slideCount: 20, speaker: 'Alice' });
      engine.addDeck({ id: 'deck_2', title: 'Product Architecture', slideCount: 35, speaker: 'Bob' });
      engine.addDeck({ id: 'deck_3', title: 'Financials & Future', slideCount: 15, speaker: 'Carol' });

      assert.equal(engine.getPlaylist().length, 3);
      assert.equal(engine.getActiveDeck().id, 'deck_1');

      // Switch to deck 2
      const res = await engine.switchDeck('deck_2');
      assert.equal(res.success, true);
      assert.equal(engine.getActiveDeck().id, 'deck_2');
      assert.equal(res.audienceWindowPreserved, true);

      const switchEvt = broadcastEvents.find(e => e.type === 'LOAD_DOCUMENT');
      assert.ok(switchEvt);
      assert.equal(switchEvt.deckId, 'deck_2');
      assert.equal(switchEvt.title, 'Product Architecture');
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 6: Rehearsal Metrics & Slide Time Heatmap
  // ---------------------------------------------------------------------------
  describe('Feature 6: Rehearsal Metrics & Slide Time Heatmap', () => {
    it('tracks slide dwell times, computes heatmap pacing, and exports reports', () => {
      const engine = new PlaylistMetricsEngine({ isPro: true });

      engine.recordSlideDwellTime(1, 30, 'Intro');
      engine.recordSlideDwellTime(2, 180, 'Deep Dive Architecture');
      engine.recordSlideDwellTime(3, 15, 'Summary');

      const summary = engine.getMetricsSummary();
      assert.equal(summary.totalDurationSeconds, 225);
      assert.equal(summary.slideCount, 3);
      assert.equal(summary.averageTimePerSlide, 75);
      assert.equal(summary.longestSlide.slide, 2);
      assert.equal(summary.shortestSlide.slide, 3);

      // Verify CSV export
      const csvRes = engine.exportCsvReport();
      assert.ok(csvRes.csv.includes('Slide,Title,TimeSeconds,FormattedTime'));
      assert.ok(csvRes.csv.includes('2,"Deep Dive Architecture",180,03:00'));

      // Verify Markdown export
      const mdRes = engine.exportMarkdownReport();
      assert.ok(mdRes.markdown.includes('# ⏱️ Rehearsal Metrics & Slide Time Heatmap Report'));
      assert.ok(mdRes.markdown.includes('| 2 | Deep Dive Architecture | 180 | 03:00 |'));
    });
  });

  // ---------------------------------------------------------------------------
  // Feature 7: Speaker Notes Export
  // ---------------------------------------------------------------------------
  describe('Feature 7: Speaker Notes Export', () => {
    it('formats all slide speaker notes into clean Markdown handouts', () => {
      const engine = new PlaylistMetricsEngine({ isPro: true });

      engine.setSpeakerNotes(1, 'Welcome everyone and introduce keynote agenda.');
      engine.setSpeakerNotes(2, 'Highlight 40% performance improvement in benchmarks.');
      engine.setSpeakerNotes(3, 'Pause for audience questions and hand over to Q&A.');

      const notesRes = engine.exportSpeakerNotesMarkdown({
        documentTitle: 'Annual Developer Conference',
        speaker: 'Chief Technology Officer',
        slideCount: 3
      });

      assert.equal(notesRes.success, true);
      assert.ok(notesRes.markdown.includes('# 📝 Speaker Notes Handout: Annual Developer Conference'));
      assert.ok(notesRes.markdown.includes('### Slide 1: Slide 1'));
      assert.ok(notesRes.markdown.includes('> Welcome everyone and introduce keynote agenda.'));
      assert.ok(notesRes.markdown.includes('### Slide 2: Slide 2'));
      assert.ok(notesRes.markdown.includes('> Highlight 40% performance improvement in benchmarks.'));
    });
  });

  // ---------------------------------------------------------------------------
  // Paywall Security Gating Verification Across All 7 Features
  // ---------------------------------------------------------------------------
  describe('Strict Paywall Security Gating', () => {
    it('blocks unauthorized access to all Pro features when in Free tier', async () => {
      const timer = new TimerAnnotationEngine({ isPro: false });
      const playlist = new PlaylistMetricsEngine({ isPro: false });
      const watermark = new WatermarkBannerEngine.WatermarkBannerEngine();
      watermark.isPro = () => false;

      // Feature 1 & 4 gating
      assert.equal(watermark.guardPro('watermark'), false);
      assert.equal(watermark.guardPro('banner'), false);

      // Feature 2 gating
      assert.equal(timer.setTimerMode('countdown'), false);
      assert.equal(timer.setDuration(600), false);

      // Feature 3 gating
      assert.equal(timer.setColor('#38bdf8').success, false);
      assert.equal(timer.setTool('highlighter').success, false);

      // Feature 5 gating (cannot add 2nd deck)
      playlist.addDeck({ id: 'deck_1', title: 'Single Deck' });
      const addRes = playlist.addDeck({ id: 'deck_2', title: 'Blocked Deck' });
      assert.equal(addRes.error, 'PRO_REQUIRED');

      // Feature 6 & 7 gating
      const csvRes = playlist.exportCsvReport();
      assert.equal(csvRes.error, 'PRO_REQUIRED');
      const mdNotes = playlist.exportSpeakerNotesMarkdown();
      assert.equal(mdNotes.error, 'PRO_REQUIRED');
    });
  });
});
