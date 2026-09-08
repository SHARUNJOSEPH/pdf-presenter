/**
 * tests/playlist-metrics.test.js
 * Unit tests for Multi-Deck Conference Playlist, Rehearsal Metrics & Speaker Notes Export
 * PDF Presenter Suite - Enterprise Pro Module
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PlaylistMetricsEngine } = require('../js/playlist-metrics.js');

describe('PlaylistMetricsEngine - Multi-Deck Conference Playlist & Speaker Queue', () => {
  let engine;

  beforeEach(() => {
    // Default fresh instance in Free tier
    engine = new PlaylistMetricsEngine({ isPro: false });
  });

  it('initializes with empty playlist and Free tier defaults', () => {
    assert.equal(engine.isPro(), false);
    assert.deepEqual(engine.getPlaylist(), []);
    assert.equal(engine.getActiveDeck(), null);
  });

  it('allows loading 1 single deck in Free tier', () => {
    const res = engine.addDeck({
      id: 'deck-1',
      title: 'Speaker 1 - Keynote Opening',
      path: 'C:\\Presentations\\Keynote.pdf',
      slideCount: 20
    });

    assert.equal(res.success, true);
    assert.equal(res.title, 'Speaker 1 - Keynote Opening');
    assert.equal(res.active, true);
    assert.equal(engine.getPlaylist().length, 1);
    assert.equal(engine.getActiveDeck().id, 'deck-1');
  });

  it('enforces Pro gating when attempting to add a 2nd deck in Free tier', () => {
    // 1st deck succeeds
    const first = engine.addDeck({
      id: 'deck-1',
      title: 'Speaker 1 - Keynote',
      slideCount: 15
    });
    assert.equal(first.success, true);

    // 2nd deck must be blocked with PRO_REQUIRED
    const second = engine.addDeck({
      id: 'deck-2',
      title: 'Speaker 2 - Product Architecture',
      slideCount: 25
    });

    assert.equal(second.success, false);
    assert.equal(second.error, 'PRO_REQUIRED');
    assert.match(second.message, /Pro/i);
    assert.equal(engine.getPlaylist().length, 1);
  });

  it('allows multi-deck queuing in Pro tier (Keynote, Product, Financials)', () => {
    engine.setPro(true);
    assert.equal(engine.isPro(), true);

    const d1 = engine.addDeck({
      id: 'deck-keynote',
      title: 'Speaker 1 - Keynote',
      speaker: 'Alice CEO',
      path: '/docs/keynote.pdf',
      pdfBuffer: Buffer.from('mock-pdf-1'),
      slideCount: 12
    });
    const d2 = engine.addDeck({
      id: 'deck-product',
      title: 'Speaker 2 - Product Architecture',
      speaker: 'Bob CTO',
      path: '/docs/product.pdf',
      pdfBuffer: Buffer.from('mock-pdf-2'),
      slideCount: 30
    });
    const d3 = engine.addDeck({
      id: 'deck-financials',
      title: 'Speaker 3 - Financials & Roadmap',
      speaker: 'Carol CFO',
      path: '/docs/financials.pdf',
      pdfBuffer: Buffer.from('mock-pdf-3'),
      slideCount: 18
    });

    assert.equal(d1.success, true);
    assert.equal(d2.success, true);
    assert.equal(d3.success, true);

    const playlist = engine.getPlaylist();
    assert.equal(playlist.length, 3);

    // Verify playlist item structure
    for (const item of playlist) {
      assert.ok(item.id);
      assert.ok(item.title);
      assert.ok(item.path);
      assert.ok(item.pdfBuffer);
      assert.ok(typeof item.slideCount === 'number');
      assert.ok(typeof item.active === 'boolean');
    }

    // First deck is active by default, others inactive
    assert.equal(playlist[0].active, true);
    assert.equal(playlist[1].active, false);
    assert.equal(playlist[2].active, false);
    assert.equal(engine.getActiveDeck().id, 'deck-keynote');
  });

  it('reorders playlist decks with Pro gating and boundary checks', () => {
    engine.setPro(true);
    engine.addDeck({ id: 'd1', title: 'Deck 1' });
    engine.addDeck({ id: 'd2', title: 'Deck 2' });
    engine.addDeck({ id: 'd3', title: 'Deck 3' });

    // Move Deck 3 to top
    const reorderRes = engine.reorderDecks(2, 0);
    assert.equal(reorderRes.success, true);
    const updated = engine.getPlaylist();
    assert.equal(updated[0].id, 'd3');
    assert.equal(updated[1].id, 'd1');
    assert.equal(updated[2].id, 'd2');

    // Invalid index
    const invalid = engine.reorderDecks(-1, 5);
    assert.equal(invalid.success, false);
    assert.equal(invalid.error, 'INVALID_INDEX');

    // Pro gating on reorder
    engine.setPro(false);
    const gated = engine.reorderDecks(0, 1);
    assert.equal(gated.success, false);
    assert.equal(gated.error, 'PRO_REQUIRED');
  });

  it('removes decks and reassigns active deck automatically if needed', () => {
    engine.setPro(true);
    engine.addDeck({ id: 'd1', title: 'Deck 1', active: true });
    engine.addDeck({ id: 'd2', title: 'Deck 2', active: false });

    assert.equal(engine.getActiveDeck().id, 'd1');

    // Remove active deck
    const rem = engine.removeDeck('d1');
    assert.equal(rem.success, true);
    assert.equal(rem.removedId, 'd1');
    assert.equal(engine.getPlaylist().length, 1);

    // Remaining deck d2 should become active
    assert.equal(engine.getActiveDeck().id, 'd2');

    // Remove remaining
    engine.removeDeck('d2');
    assert.equal(engine.getActiveDeck(), null);
    assert.equal(engine.getPlaylist().length, 0);
  });

  it('switchDeck(deckId) smoothly switches documents without dropping or restarting audience window', async () => {
    engine.setPro(true);

    let switchedDeckReceived = null;
    const syncBusMessages = [];

    engine.options.onDeckSwitch = async (deck) => {
      switchedDeckReceived = deck;
    };
    engine.options.syncBus = {
      send: (msg) => syncBusMessages.push(msg)
    };

    engine.addDeck({ id: 'd1', title: 'Keynote', slideCount: 10 });
    engine.addDeck({ id: 'd2', title: 'Product Deep Dive', slideCount: 20 });

    assert.equal(engine.getActiveDeck().id, 'd1');

    // Switch to d2
    const switchRes = await engine.switchDeck('d2');
    assert.equal(switchRes.success, true);
    assert.equal(switchRes.deck.id, 'd2');
    assert.equal(switchRes.previousDeckId, 'd1');
    assert.equal(switchRes.audienceWindowPreserved, true); // Verified: audience window stays alive!

    // Verify active flags in playlist
    const playlist = engine.getPlaylist();
    assert.equal(playlist[0].active, false);
    assert.equal(playlist[1].active, true);
    assert.equal(engine.getActiveDeck().id, 'd2');

    // Verify callbacks & sync bus broadcast
    assert.equal(switchedDeckReceived.id, 'd2');
    assert.equal(syncBusMessages.length, 1);
    assert.equal(syncBusMessages[0].type, 'LOAD_DOCUMENT');
    assert.equal(syncBusMessages[0].deckId, 'd2');
    assert.equal(syncBusMessages[0].preserveAudienceWindow, true);

    // Non-existent deck switch returns DECK_NOT_FOUND
    const badSwitch = await engine.switchDeck('non-existent');
    assert.equal(badSwitch.success, false);
    assert.equal(badSwitch.error, 'DECK_NOT_FOUND');
  });
});

describe('PlaylistMetricsEngine - Rehearsal Metrics & Slide Time Heatmap', () => {
  let engine;

  beforeEach(() => {
    engine = new PlaylistMetricsEngine({ isPro: true });
  });

  it('tracks slide dwell time precisely across transitions and repeat visits', () => {
    // Inject exact dwell times specified in requirements:
    // Slide 1: 45s, Slide 2: 120s, Slide 3: 15s
    engine.recordSlideDwellTime(1, 45, 'Slide 1 - Introduction');
    engine.recordSlideDwellTime(2, 120, 'Slide 2 - Deep Architecture');
    engine.recordSlideDwellTime(3, 15, 'Slide 3 - Conclusion');

    const summary = engine.getMetricsSummary();
    assert.equal(summary.slideCount, 3);
    assert.equal(summary.totalDurationSeconds, 180); // 45 + 120 + 15 = 180
    assert.equal(summary.formattedTotalDuration, '03:00');
    assert.equal(summary.averageTimePerSlide, 60); // 180 / 3 = 60
    assert.equal(summary.formattedAverageTime, '01:00');

    // Longest and shortest slides
    assert.equal(summary.longestSlide.slide, 2);
    assert.equal(summary.longestSlide.timeSeconds, 120);
    assert.equal(summary.longestSlide.formattedTime, '02:00');

    assert.equal(summary.shortestSlide.slide, 3);
    assert.equal(summary.shortestSlide.timeSeconds, 15);
    assert.equal(summary.shortestSlide.formattedTime, '00:15');

    // Repeat visit to Slide 1 adds another 15s -> 60s total for Slide 1
    engine.recordSlideDwellTime(1, 15);
    const updated = engine.getMetricsSummary();
    assert.equal(updated.slides[0].timeSeconds, 60);
    assert.equal(updated.slides[0].formattedTime, '01:00');
    assert.equal(updated.totalDurationSeconds, 195);
  });

  it('calculates slide heatmap percentage, intensity, and pacing pace tags', () => {
    engine.setSlideDwellTime(1, 45, 'Title Overview');
    engine.setSlideDwellTime(2, 120, 'System Internals');
    engine.setSlideDwellTime(3, 15, 'Summary Q&A');

    const heatmap = engine.getHeatmapData();
    assert.equal(heatmap.length, 3);

    // Slide 1: 45s / 180s = 25.0%
    assert.equal(heatmap[0].slide, 1);
    assert.equal(heatmap[0].percentage, 25.0);
    assert.equal(heatmap[0].pace, 'optimal');
    assert.ok(heatmap[0].intensity > 0 && heatmap[0].intensity < 1);

    // Slide 2: 120s / 180s = 66.7% (High dwell, > 1.5x average of 60s)
    assert.equal(heatmap[1].slide, 2);
    assert.equal(heatmap[1].percentage, 66.7);
    assert.equal(heatmap[1].pace, 'slow');
    assert.equal(heatmap[1].intensity, 1.0); // Highest dwell gets 1.0 intensity
    assert.equal(heatmap[1].color, '#ef4444'); // Hot / Critical color

    // Slide 3: 15s / 180s = 8.3% (Brief / fast pace, < 0.5x average of 60s)
    assert.equal(heatmap[2].slide, 3);
    assert.equal(heatmap[2].percentage, 8.3);
    assert.equal(heatmap[2].pace, 'fast');
    assert.ok(heatmap[2].intensity < 0.33);
    assert.equal(heatmap[2].color, '#38bdf8'); // Cool / sky blue color
  });

  it('generates formatted CSV export matching Slide,Title,TimeSeconds,FormattedTime', () => {
    engine.setSlideDwellTime(1, 45, 'Slide 1');
    engine.setSlideDwellTime(2, 120, 'Slide 2');
    engine.setSlideDwellTime(3, 15, 'Slide 3');

    const res = engine.exportCsvReport();
    assert.equal(res.success, true);
    assert.ok(res.csv);

    const lines = res.csv.trim().split(/\r?\n/);
    // Header must match requirement exactly
    assert.equal(lines[0], 'Slide,Title,TimeSeconds,FormattedTime');

    // Data rows
    assert.equal(lines[1], '1,"Slide 1",45,00:45');
    assert.equal(lines[2], '2,"Slide 2",120,02:00');
    assert.equal(lines[3], '3,"Slide 3",15,00:15');

    // Pro gating on CSV export
    engine.setPro(false);
    const gated = engine.exportCsvReport();
    assert.equal(gated.success, false);
    assert.equal(gated.error, 'PRO_REQUIRED');
  });

  it('generates rich Markdown summary report with table and coaching insights', () => {
    engine.setSlideDwellTime(1, 45, 'Executive Summary');
    engine.setSlideDwellTime(2, 120, 'Technical Deep Dive');
    engine.setSlideDwellTime(3, 15, 'Open Q&A');

    const res = engine.exportMarkdownReport({
      title: 'Global Tech Summit 2026',
      presenter: 'Dr. Evelyn Reed'
    });

    assert.equal(res.success, true);
    assert.ok(res.markdown);

    const md = res.markdown;
    assert.ok(md.includes('# ⏱️ Rehearsal Metrics & Slide Time Heatmap Report'));
    assert.ok(md.includes('Global Tech Summit 2026'));
    assert.ok(md.includes('Dr. Evelyn Reed'));
    assert.ok(md.includes('Total Rehearsal Duration:** 03:00 (180s)'));
    assert.ok(md.includes('Longest Slide:** Slide 2 (Technical Deep Dive) — **02:00**'));
    assert.ok(md.includes('Shortest Slide:** Slide 3 (Open Q&A) — **00:15**'));

    // Verify Markdown table
    assert.ok(md.includes('| Slide | Title | Time (s) | Formatted Time | % of Total | Pace Assessment |'));
    assert.ok(md.includes('| 1 | Executive Summary | 45 | 00:45 | 25% | Optimal |'));
    assert.ok(md.includes('| 2 | Technical Deep Dive | 120 | 02:00 | 66.7% | High Dwell / Needs Trim |'));
    assert.ok(md.includes('| 3 | Open Q&A | 15 | 00:15 | 8.3% | Brief / Rapid Pace |'));

    // Gating in Free tier
    engine.setPro(false);
    const gated = engine.exportMarkdownReport();
    assert.equal(gated.success, false);
    assert.equal(gated.error, 'PRO_REQUIRED');
  });

  it('handles simulated live navigation transitions via recordSlideTransition', () => {
    engine.resetMetrics();

    // Start on slide 1
    engine.startTracking(1, 'Introduction');

    // Simulate transition to slide 2 (inject dwell directly for deterministic test)
    engine.recordSlideDwellTime(1, 30);
    engine.recordSlideTransition(2, 'Features');
    engine.recordSlideDwellTime(2, 90);
    engine.recordSlideTransition(3, 'Pricing');
    engine.recordSlideDwellTime(3, 20);

    const summary = engine.stopTracking();
    assert.equal(summary.slideCount, 3);
    assert.equal(summary.slides[0].timeSeconds, 30);
    assert.equal(summary.slides[1].timeSeconds, 90);
    assert.equal(summary.slides[2].timeSeconds, 20);
  });
});

describe('PlaylistMetricsEngine - Speaker Notes Handout & Markdown Export', () => {
  let engine;

  beforeEach(() => {
    engine = new PlaylistMetricsEngine({ isPro: true });
  });

  it('stores and gathers speaker notes across slides', () => {
    engine.setSpeakerNotes(1, 'Welcome everyone to the annual symposium. Pause for applause.');
    engine.setSpeakerNotes(2, 'Walk through the 3 architectural tiers. Point laser at database cluster.');
    engine.setSpeakerNotes(3, 'Thank sponsors and invite questions from the audience.');

    assert.equal(engine.getSpeakerNotes(1), 'Welcome everyone to the annual symposium. Pause for applause.');
    assert.equal(engine.getSpeakerNotes(2), 'Walk through the 3 architectural tiers. Point laser at database cluster.');
    assert.equal(engine.getSpeakerNotes(3), 'Thank sponsors and invite questions from the audience.');

    const gathered = engine.gatherSpeakerNotes({ slideCount: 3 });
    assert.equal(gathered.length, 3);
    assert.equal(gathered[0].slide, 1);
    assert.ok(gathered[0].notes.includes('Welcome everyone'));
    assert.equal(gathered[1].slide, 2);
    assert.ok(gathered[1].notes.includes('architectural tiers'));
  });

  it('exports formatted Markdown notes handout with titles, numbers, notes, and timestamp', () => {
    engine.setSpeakerNotes(1, 'Introductory remarks and safety briefing.');
    engine.setSpeakerNotes(2, 'Demonstrate live Companion integration.');

    const res = engine.exportSpeakerNotesMarkdown({
      documentTitle: 'AV Engineering Masterclass',
      speaker: 'Alex Morgan',
      timestamp: '2026-09-08 11:30:00'
    });

    assert.equal(res.success, true);
    assert.ok(res.markdown);

    const md = res.markdown;
    assert.ok(md.includes('# 📝 Speaker Notes Handout: AV Engineering Masterclass'));
    assert.ok(md.includes('Presentation:** AV Engineering Masterclass'));
    assert.ok(md.includes('Speaker:** Alex Morgan'));
    assert.ok(md.includes('Generated:** 2026-09-08 11:30:00'));
    assert.ok(md.includes('### Slide 1: Slide 1'));
    assert.ok(md.includes('> Introductory remarks and safety briefing.'));
    assert.ok(md.includes('### Slide 2: Slide 2'));
    assert.ok(md.includes('> Demonstrate live Companion integration.'));

    // Gating in Free tier
    engine.setPro(false);
    const gated = engine.exportSpeakerNotesMarkdown();
    assert.equal(gated.success, false);
    assert.equal(gated.error, 'PRO_REQUIRED');
  });

  it('exports formatted plain-text handout with clean separator banners', () => {
    engine.setSpeakerNotes(1, 'Keynote kickoff remarks.');
    engine.setSpeakerNotes(2, 'Roadmap timeline breakdown.');

    const res = engine.exportSpeakerNotesText({
      documentTitle: 'Product Roadmap 2026',
      speaker: 'Sarah Jenkins',
      timestamp: '2026-09-08 12:00:00'
    });

    assert.equal(res.success, true);
    assert.ok(res.text);

    const txt = res.text;
    assert.ok(txt.includes('SPEAKER NOTES HANDOUT: PRODUCT ROADMAP 2026'));
    assert.ok(txt.includes('Speaker: Sarah Jenkins'));
    assert.ok(txt.includes('SLIDE 1: Slide 1'));
    assert.ok(txt.includes('Keynote kickoff remarks.'));
    assert.ok(txt.includes('SLIDE 2: Slide 2'));
    assert.ok(txt.includes('Roadmap timeline breakdown.'));

    // Gating in Free tier
    engine.setPro(false);
    const gated = engine.exportSpeakerNotesText();
    assert.equal(gated.success, false);
    assert.equal(gated.error, 'PRO_REQUIRED');
  });

  it('handles slides with empty notes gracefully in exports', () => {
    engine.setSpeakerNotes(1, 'Has note');
    // Slide 2 has no note set

    const mdRes = engine.exportSpeakerNotesMarkdown({ slideCount: 2 });
    assert.equal(mdRes.success, true);
    assert.ok(mdRes.markdown.includes('*(No private speaker notes recorded for this slide)*'));

    const txtRes = engine.exportSpeakerNotesText({ slideCount: 2 });
    assert.equal(txtRes.success, true);
    assert.ok(txtRes.text.includes('[No private speaker notes recorded for this slide]'));
  });
});

describe('PlaylistMetricsEngine - Static Utility Functions', () => {
  it('PlaylistMetricsEngine.formatTime correctly formats seconds, minutes, and hours', () => {
    assert.equal(PlaylistMetricsEngine.formatTime(0), '00:00');
    assert.equal(PlaylistMetricsEngine.formatTime(15), '00:15');
    assert.equal(PlaylistMetricsEngine.formatTime(45), '00:45');
    assert.equal(PlaylistMetricsEngine.formatTime(120), '02:00');
    assert.equal(PlaylistMetricsEngine.formatTime(3665), '01:01:05');
  });

  it('PlaylistMetricsEngine.generateHeatmapColor maps intensity to palette colors', () => {
    assert.equal(PlaylistMetricsEngine.generateHeatmapColor(0.1), '#38bdf8'); // Sky blue
    assert.equal(PlaylistMetricsEngine.generateHeatmapColor(0.5), '#818cf8'); // Indigo
    assert.equal(PlaylistMetricsEngine.generateHeatmapColor(0.75), '#f59e0b'); // Amber
    assert.equal(PlaylistMetricsEngine.generateHeatmapColor(0.95), '#ef4444'); // Red
  });
});
