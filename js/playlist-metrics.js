/**
 * js/playlist-metrics.js - Multi-Deck Conference Playlist, Rehearsal Metrics & Speaker Notes Export Engine
 * PDF Presenter Suite - Enterprise Pro Module
 *
 * Capabilities:
 * 1. Multi-Deck Playlist Queue Manager (Pro only for multiple decks):
 *    - Allows queuing multiple speaker presentations (e.g., Keynote, Product, Financials)
 *    - Stores playlist items: { id, title, path, pdfBuffer, slideCount, active: boolean }
 *    - Seamless switchDeck(deckId) preserving audience window without drops or restarts
 *
 * 2. Rehearsal Metrics & Slide Time Heatmap (Pro only):
 *    - Automatically tracks dwell time (seconds spent) on each slide index
 *    - Aggregates total duration, average time per slide, longest & shortest slides
 *    - Generates Markdown summary report and CSV export (Slide,Title,TimeSeconds,FormattedTime)
 *
 * 3. Speaker Notes Handout & Markdown Export (Pro only):
 *    - Gathers speaker notes across all slides
 *    - Formats clean Markdown documents and plain-text handouts with title, slide #, notes, and timestamp
 */

(function(global) {
  'use strict';

  class PlaylistMetricsEngine {
    /**
     * @param {Object} options
     * @param {boolean|Function} [options.isPro] - Pro tier override or predicate function
     * @param {Object} [options.licenseManager] - LicenseManager instance
     * @param {Function} [options.onDeckSwitch] - Async callback invoked on deck switch
     * @param {Object} [options.syncBus] - PresentationSyncBus instance for broadcasting sync messages
     * @param {boolean} [options.throwOnError] - Whether gating errors throw instead of returning error payload
     */
    constructor(options = {}) {
      this.options = Object.assign({
        isPro: null,
        licenseManager: null,
        onDeckSwitch: null,
        syncBus: null,
        throwOnError: false
      }, options);

      // Multi-Deck Queue: Array of { id, title, path, pdfBuffer, slideCount, active, speaker, notes }
      this.playlist = [];
      this.activeDeckId = null;

      // Rehearsal Tracking & Metrics: Map of slideIndex -> { timeSeconds, visitCount, title }
      this.slideDwellTimes = new Map();
      this.currentTrackingSlide = null;
      this.slideStartTime = null;
      this.isTracking = false;
      this.sessionStartTime = null;

      // Speaker Notes Storage: Map of slideIndex -> string
      this.speakerNotes = new Map();
    }

    // =========================================================================
    // 1. FREEMIUM & PRO ENTITLEMENT GATING
    // =========================================================================

    /**
     * Check if Pro license is active
     * @returns {boolean}
     */
    isPro() {
      // 1. Explicit boolean option
      if (typeof this.options.isPro === 'boolean') {
        return this.options.isPro;
      }
      // 2. Predicate function option
      if (typeof this.options.isPro === 'function') {
        return Boolean(this.options.isPro());
      }
      // 3. Injected LicenseManager instance
      if (this.options.licenseManager) {
        if (typeof this.options.licenseManager.isPro === 'function') {
          return Boolean(this.options.licenseManager.isPro());
        }
        if (this.options.licenseManager.state && typeof this.options.licenseManager.state.isPro === 'boolean') {
          return Boolean(this.options.licenseManager.state.isPro);
        }
      }
      // 4. Global window.UpgradeModal
      if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function') {
        return Boolean(window.UpgradeModal.isPro());
      }
      // 5. Node.js environment variables (CI / Developer override)
      if (typeof process !== 'undefined' && process.env) {
        if (process.env.PDF_PRESENTER_PRO === 'true' || process.env.CI_PRO_LICENSE === 'true') {
          return true;
        }
      }
      return false;
    }

    /**
     * Dynamically update Pro tier status
     * @param {boolean} proValue
     */
    setPro(proValue) {
      this.options.isPro = Boolean(proValue);
    }

    /**
     * Internal guard helper for Pro-gated features
     * @param {string} featureName
     * @returns {{ success: false, error: 'PRO_REQUIRED', message: string }|null}
     */
    _checkProGate(featureName) {
      if (!this.isPro()) {
        const errorPayload = {
          success: false,
          error: 'PRO_REQUIRED',
          feature: featureName,
          message: `${featureName} is a Pro tier exclusive feature. Upgrade to Pro to unlock unlimited conference multi-deck queues, slide dwell heatmap reports, and speaker notes exports.`
        };
        if (this.options.throwOnError) {
          const err = new Error(errorPayload.message);
          err.code = 'PRO_REQUIRED';
          err.feature = featureName;
          throw err;
        }
        return errorPayload;
      }
      return null;
    }

    // =========================================================================
    // 2. MULTI-DECK PLAYLIST MANAGER (CONFERENCE SPEAKER QUEUE)
    // =========================================================================

    /**
     * Add a deck/presentation to the conference playlist queue.
     * Free users may load only 1 single deck; multi-deck queuing is Pro only.
     *
     * @param {Object} deck
     * @param {string} [deck.id]
     * @param {string} deck.title
     * @param {string} [deck.path]
     * @param {Uint8Array|ArrayBuffer|Buffer|null} [deck.pdfBuffer]
     * @param {number} [deck.slideCount=1]
     * @param {boolean} [deck.active=false]
     * @param {string} [deck.speaker='']
     * @param {Array} [deck.notes]
     * @returns {Object} Added deck item or error payload
     */
    addDeck(deck) {
      if (!deck || typeof deck !== 'object') {
        const err = { success: false, error: 'INVALID_DECK', message: 'Deck data object is required' };
        if (this.options.throwOnError) throw new Error(err.message);
        return err;
      }

      // Pro Gating: Free tier allows maximum 1 single deck
      if (!this.isPro() && this.playlist.length >= 1) {
        return this._checkProGate('Multi-Deck Conference Playlist');
      }

      const id = deck.id || `deck_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const title = String(deck.title || 'Untitled Presentation').trim();
      const path = deck.path || '';
      const pdfBuffer = deck.pdfBuffer || null;
      const slideCount = Math.max(1, parseInt(deck.slideCount, 10) || 1);
      const speaker = deck.speaker ? String(deck.speaker).trim() : '';
      const notes = Array.isArray(deck.notes) ? [...deck.notes] : [];

      // Determine initial active state
      let active = Boolean(deck.active);
      if (this.playlist.length === 0) {
        // First deck is automatically active if not explicitly declared false
        active = deck.active !== false;
      }

      const item = {
        id,
        title,
        path,
        pdfBuffer,
        slideCount,
        active,
        speaker,
        notes
      };

      if (active) {
        // Deactivate all others
        for (const existing of this.playlist) {
          existing.active = false;
        }
        this.activeDeckId = id;
      }

      this.playlist.push(item);

      return Object.assign({
        success: true,
        deck: item,
        playlist: this.getPlaylist()
      }, item);
    }

    /**
     * Remove a deck from the playlist queue by ID
     * @param {string} deckId
     * @returns {Object}
     */
    removeDeck(deckId) {
      const index = this.playlist.findIndex(d => d.id === deckId);
      if (index === -1) {
        return { success: false, error: 'DECK_NOT_FOUND', message: `Deck ${deckId} not found in playlist` };
      }

      const [removed] = this.playlist.splice(index, 1);

      // If we removed the currently active deck, activate the next available one
      if (removed.active && this.playlist.length > 0) {
        const nextActiveIndex = Math.min(index, this.playlist.length - 1);
        this.playlist[nextActiveIndex].active = true;
        this.activeDeckId = this.playlist[nextActiveIndex].id;
      } else if (this.playlist.length === 0) {
        this.activeDeckId = null;
      }

      return {
        success: true,
        removedId: deckId,
        activeDeck: this.getActiveDeck(),
        playlist: this.getPlaylist()
      };
    }

    /**
     * Get a shallow clone of the playlist queue
     * @returns {Array<Object>}
     */
    getPlaylist() {
      return this.playlist.map(item => Object.assign({}, item));
    }

    /**
     * Find a deck by ID
     * @param {string} deckId
     * @returns {Object|null}
     */
    getDeck(deckId) {
      const found = this.playlist.find(d => d.id === deckId);
      return found ? Object.assign({}, found) : null;
    }

    /**
     * Get the currently active deck item
     * @returns {Object|null}
     */
    getActiveDeck() {
      const active = this.playlist.find(d => d.active);
      return active ? Object.assign({}, active) : null;
    }

    /**
     * Reorder decks in the playlist queue (Pro only)
     * @param {number} fromIndex
     * @param {number} toIndex
     * @returns {Object}
     */
    reorderDecks(fromIndex, toIndex) {
      const gate = this._checkProGate('Queue Reordering');
      if (gate) return gate;

      if (fromIndex < 0 || fromIndex >= this.playlist.length ||
          toIndex < 0 || toIndex >= this.playlist.length) {
        return { success: false, error: 'INVALID_INDEX', message: 'Indices out of playlist bounds' };
      }

      const [movedItem] = this.playlist.splice(fromIndex, 1);
      this.playlist.splice(toIndex, 0, movedItem);

      return {
        success: true,
        playlist: this.getPlaylist()
      };
    }

    /**
     * Clear all decks from the playlist
     */
    clearPlaylist() {
      this.playlist = [];
      this.activeDeckId = null;
      return { success: true };
    }

    /**
     * Smoothly switch the presentation document without dropping or restarting the audience window.
     * Keeps the audience display completely uninterrupted while updating the document stream.
     *
     * @param {string} deckId
     * @returns {Promise<Object>|Object}
     */
    async switchDeck(deckId) {
      const targetDeck = this.playlist.find(d => d.id === deckId);
      if (!targetDeck) {
        return { success: false, error: 'DECK_NOT_FOUND', message: `Deck "${deckId}" not found in playlist.` };
      }

      const previousDeckId = this.activeDeckId;

      // Pause/flush current slide dwell tracking before document switch
      if (this.isTracking) {
        this.pauseTracking();
      }

      // Mark target active and all others inactive
      for (const item of this.playlist) {
        item.active = (item.id === deckId);
      }
      this.activeDeckId = deckId;

      // Reset metrics tracking for new deck (start fresh from slide 1)
      this.currentTrackingSlide = 1;
      this.slideStartTime = Date.now();
      this.isTracking = true;

      // Broadcast sync event to audience window if syncBus is available
      // audienceWindowPreserved ensures zero reload, zero flash, zero disconnection
      if (this.options.syncBus && typeof this.options.syncBus.send === 'function') {
        try {
          this.options.syncBus.send({
            type: 'LOAD_DOCUMENT',
            deckId: targetDeck.id,
            title: targetDeck.title,
            path: targetDeck.path,
            slideCount: targetDeck.slideCount,
            preserveAudienceWindow: true,
            timestamp: Date.now()
          });
        } catch (e) {
          console.warn('[PlaylistMetricsEngine] Error broadcasting deck switch via syncBus:', e);
        }
      }

      // Trigger user-configured async switch handler (e.g., rendering cockpit UI)
      if (typeof this.options.onDeckSwitch === 'function') {
        try {
          await this.options.onDeckSwitch(targetDeck);
        } catch (err) {
          console.warn('[PlaylistMetricsEngine] Error in onDeckSwitch handler:', err);
        }
      }

      return {
        success: true,
        deck: Object.assign({}, targetDeck),
        previousDeckId,
        audienceWindowPreserved: true,
        timestamp: Date.now()
      };
    }

    // =========================================================================
    // 3. REHEARSAL METRICS & SLIDE TIME HEATMAP
    // =========================================================================

    /**
     * Retrieve or initialize slide metrics record
     * @private
     */
    _getSlideRecord(slideIndex) {
      const index = parseInt(slideIndex, 10);
      if (!this.slideDwellTimes.has(index)) {
        this.slideDwellTimes.set(index, {
          timeSeconds: 0,
          visitCount: 0,
          title: `Slide ${index}`
        });
      }
      return this.slideDwellTimes.get(index);
    }

    /**
     * Start automatic rehearsal tracking
     * @param {number} [initialSlide=1]
     * @param {string} [title='']
     */
    startTracking(initialSlide = 1, title = '') {
      this.isTracking = true;
      this.currentTrackingSlide = parseInt(initialSlide, 10) || 1;
      this.slideStartTime = Date.now();
      if (!this.sessionStartTime) {
        this.sessionStartTime = Date.now();
      }

      const rec = this._getSlideRecord(this.currentTrackingSlide);
      if (title) rec.title = title;
      rec.visitCount = Math.max(1, rec.visitCount || 1);

      return {
        success: true,
        trackingSlide: this.currentTrackingSlide,
        startedAt: this.slideStartTime
      };
    }

    /**
     * Record a slide change / navigation transition.
     * Flushes dwell time on the slide being exited and starts tracking the newly entered slide.
     *
     * @param {number} toSlideIndex
     * @param {string} [newTitle='']
     */
    recordSlideTransition(toSlideIndex, newTitle = '') {
      const now = Date.now();
      const targetIndex = parseInt(toSlideIndex, 10);

      // Settle time on previous slide
      if (this.isTracking && this.currentTrackingSlide !== null && this.slideStartTime !== null) {
        const elapsedSec = Math.max(0, Math.round((now - this.slideStartTime) / 1000));
        const prevRecord = this._getSlideRecord(this.currentTrackingSlide);
        prevRecord.timeSeconds += elapsedSec;
      }

      // Advance to next slide
      this.currentTrackingSlide = targetIndex;
      this.slideStartTime = now;
      this.isTracking = true;

      const nextRecord = this._getSlideRecord(targetIndex);
      if (newTitle) nextRecord.title = newTitle;
      nextRecord.visitCount = (nextRecord.visitCount || 0) + 1;

      return {
        success: true,
        currentSlide: targetIndex,
        dwellRecord: Object.assign({}, nextRecord)
      };
    }

    /**
     * Pause tracking (flushes elapsed seconds on current slide without discarding state)
     */
    pauseTracking() {
      if (this.isTracking && this.currentTrackingSlide !== null && this.slideStartTime !== null) {
        const elapsedSec = Math.max(0, Math.round((Date.now() - this.slideStartTime) / 1000));
        const rec = this._getSlideRecord(this.currentTrackingSlide);
        rec.timeSeconds += elapsedSec;
      }
      this.isTracking = false;
      this.slideStartTime = null;
    }

    /**
     * Resume tracking from current slide or specified slide
     * @param {number} [slideIndex]
     */
    resumeTracking(slideIndex = null) {
      const target = slideIndex !== null ? parseInt(slideIndex, 10) : (this.currentTrackingSlide || 1);
      return this.startTracking(target);
    }

    /**
     * Stop rehearsal tracking and finalize session metrics
     * @returns {Object} Metrics summary
     */
    stopTracking() {
      this.pauseTracking();
      this.currentTrackingSlide = null;
      return this.getMetricsSummary();
    }

    /**
     * Manually add or inject dwell time for a slide (useful for test mocks, API sync, or manual adjustment)
     * @param {number} slideIndex
     * @param {number} seconds
     * @param {string} [title='']
     */
    recordSlideDwellTime(slideIndex, seconds, title = '') {
      const rec = this._getSlideRecord(slideIndex);
      const addedSec = Math.max(0, parseInt(seconds, 10) || 0);
      rec.timeSeconds += addedSec;
      rec.visitCount = (rec.visitCount || 0) + 1;
      if (title) rec.title = title;
      return Object.assign({}, rec);
    }

    /**
     * Set exact dwell time for a slide
     * @param {number} slideIndex
     * @param {number} seconds
     * @param {string} [title='']
     */
    setSlideDwellTime(slideIndex, seconds, title = '') {
      const rec = this._getSlideRecord(slideIndex);
      rec.timeSeconds = Math.max(0, parseInt(seconds, 10) || 0);
      rec.visitCount = Math.max(1, rec.visitCount || 1);
      if (title) rec.title = title;
      return Object.assign({}, rec);
    }

    /**
     * Reset all recorded rehearsal metrics
     */
    resetMetrics() {
      this.slideDwellTimes.clear();
      this.currentTrackingSlide = null;
      this.slideStartTime = null;
      this.isTracking = false;
      this.sessionStartTime = null;
    }

    /**
     * Calculate and return comprehensive rehearsal metrics & slide time heatmap summary
     * @returns {Object}
     */
    getMetricsSummary() {
      // If currently tracking, calculate real-time transient elapsed time for current slide
      const transientBonus = new Map();
      if (this.isTracking && this.currentTrackingSlide !== null && this.slideStartTime !== null) {
        const liveElapsed = Math.max(0, Math.round((Date.now() - this.slideStartTime) / 1000));
        transientBonus.set(this.currentTrackingSlide, liveElapsed);
      }

      // Collect all slide entries sorted by slide number
      const sortedKeys = Array.from(this.slideDwellTimes.keys()).sort((a, b) => a - b);
      let totalDurationSeconds = 0;

      const slideItems = sortedKeys.map(key => {
        const rec = this.slideDwellTimes.get(key);
        const bonus = transientBonus.get(key) || 0;
        const totalSec = rec.timeSeconds + bonus;
        totalDurationSeconds += totalSec;

        return {
          slide: key,
          title: rec.title || `Slide ${key}`,
          timeSeconds: totalSec,
          formattedTime: PlaylistMetricsEngine.formatTime(totalSec),
          visitCount: rec.visitCount || 1
        };
      });

      const slideCount = slideItems.length;
      const averageTimePerSlide = slideCount > 0 ? Math.round(totalDurationSeconds / slideCount) : 0;

      // Identify longest and shortest slides
      let longestSlide = null;
      let shortestSlide = null;

      if (slideCount > 0) {
        longestSlide = slideItems.reduce((max, cur) => cur.timeSeconds > max.timeSeconds ? cur : max, slideItems[0]);
        shortestSlide = slideItems.reduce((min, cur) => cur.timeSeconds < min.timeSeconds ? cur : min, slideItems[0]);
      }

      // Calculate percentages, pacing flags, and heatmap intensity (0.0 to 1.0)
      const maxSeconds = longestSlide ? Math.max(1, longestSlide.timeSeconds) : 1;
      const slides = slideItems.map(item => {
        const percentage = totalDurationSeconds > 0
          ? Number(((item.timeSeconds / totalDurationSeconds) * 100).toFixed(1))
          : 0;

        const intensity = Number((item.timeSeconds / maxSeconds).toFixed(2));

        let pace = 'optimal';
        let paceLabel = 'Optimal';
        if (averageTimePerSlide > 0) {
          if (item.timeSeconds > averageTimePerSlide * 1.5) {
            pace = 'slow';
            paceLabel = 'High Dwell / Needs Trim';
          } else if (item.timeSeconds < averageTimePerSlide * 0.5 && item.timeSeconds > 0) {
            pace = 'fast';
            paceLabel = 'Brief / Rapid Pace';
          }
        }

        return Object.assign({}, item, {
          percentage,
          intensity,
          pace,
          paceLabel,
          color: PlaylistMetricsEngine.generateHeatmapColor(intensity)
        });
      });

      return {
        slideCount,
        totalDurationSeconds,
        formattedTotalDuration: PlaylistMetricsEngine.formatTime(totalDurationSeconds),
        averageTimePerSlide,
        formattedAverageTime: PlaylistMetricsEngine.formatTime(averageTimePerSlide),
        longestSlide: longestSlide ? Object.assign({}, longestSlide) : null,
        shortestSlide: shortestSlide ? Object.assign({}, shortestSlide) : null,
        slides,
        isPro: this.isPro()
      };
    }

    /**
     * Get slide time heatmap data
     * @returns {Array<Object>}
     */
    getHeatmapData() {
      const summary = this.getMetricsSummary();
      return summary.slides;
    }

    /**
     * Generate formatted Markdown summary report (Pro only)
     * @param {Object} [options]
     * @param {string} [options.title]
     * @param {string} [options.presenter]
     * @returns {Object} { success: true, markdown: string, summary: Object }
     */
    exportMarkdownReport(options = {}) {
      const gate = this._checkProGate('Rehearsal Metrics Markdown Export');
      if (gate) return gate;

      const summary = this.getMetricsSummary();
      const activeDeck = this.getActiveDeck();
      const title = options.title || (activeDeck ? activeDeck.title : 'Presentation Rehearsal');
      const presenter = options.presenter || (activeDeck && activeDeck.speaker ? activeDeck.speaker : 'Keynote Presenter');
      const dateStr = options.timestamp || new Date().toLocaleString();

      const longestStr = summary.longestSlide
        ? `Slide ${summary.longestSlide.slide} (${summary.longestSlide.title}) — **${summary.longestSlide.formattedTime}**`
        : 'None recorded';

      const shortestStr = summary.shortestSlide
        ? `Slide ${summary.shortestSlide.slide} (${summary.shortestSlide.title}) — **${summary.shortestSlide.formattedTime}**`
        : 'None recorded';

      let md = '';
      md += `# ⏱️ Rehearsal Metrics & Slide Time Heatmap Report\n\n`;
      md += `**Presentation:** ${title}  \n`;
      md += `**Presenter:** ${presenter}  \n`;
      md += `**Generated:** ${dateStr}  \n`;
      md += `**Total Rehearsal Duration:** ${summary.formattedTotalDuration} (${summary.totalDurationSeconds}s)  \n`;
      md += `**Total Slides Covered:** ${summary.slideCount}  \n`;
      md += `**Average Time Per Slide:** ${summary.formattedAverageTime} / slide  \n\n`;

      md += `### 📌 Pacing Highlights\n`;
      md += `- **Longest Slide:** ${longestStr}\n`;
      md += `- **Shortest Slide:** ${shortestStr}\n\n`;

      md += `--- \n\n`;
      md += `## 📊 Slide Breakdown & Heatmap Table\n\n`;
      md += `| Slide | Title | Time (s) | Formatted Time | % of Total | Pace Assessment |\n`;
      md += `|:---:|:---|:---:|:---:|:---:|:---|\n`;

      for (const s of summary.slides) {
        md += `| ${s.slide} | ${s.title} | ${s.timeSeconds} | ${s.formattedTime} | ${s.percentage}% | ${s.paceLabel} |\n`;
      }

      md += `\n---\n\n`;
      md += `## 💡 AV Team & Speaker Coaching Notes\n`;
      const slowSlides = summary.slides.filter(s => s.pace === 'slow');
      const fastSlides = summary.slides.filter(s => s.pace === 'fast');

      if (slowSlides.length > 0) {
        md += `- **High Dwell Alerts:** Slides ${slowSlides.map(s => s.slide).join(', ')} occupied a high share of rehearsal time. Review if these complex slides should be unpacked into 2+ slides.\n`;
      }
      if (fastSlides.length > 0) {
        md += `- **Rapid Pacing:** Slides ${fastSlides.map(s => s.slide).join(', ')} passed rapidly. Verify that all key points and numbers were clearly emphasized.\n`;
      }
      if (slowSlides.length === 0 && fastSlides.length === 0) {
        md += `- **Flawless Pacing:** Consistent dwell time across all slides within ideal presentation tolerances.\n`;
      }

      const result = {
        success: true,
        markdown: md,
        summary
      };

      // Friendly stringifier
      result.toString = () => md;
      return result;
    }

    /**
     * Generate CSV export: Slide,Title,TimeSeconds,FormattedTime (Pro only)
     * @param {Object} [options]
     * @returns {Object} { success: true, csv: string, summary: Object }
     */
    exportCsvReport(options = {}) {
      const gate = this._checkProGate('Rehearsal Metrics CSV Export');
      if (gate) return gate;

      const summary = this.getMetricsSummary();

      let csv = 'Slide,Title,TimeSeconds,FormattedTime\r\n';

      for (const s of summary.slides) {
        // RFC 4180 Escaped title
        const escapedTitle = `"${String(s.title).replace(/"/g, '""')}"`;
        csv += `${s.slide},${escapedTitle},${s.timeSeconds},${s.formattedTime}\r\n`;
      }

      const result = {
        success: true,
        csv,
        summary
      };

      result.toString = () => csv;
      return result;
    }

    // =========================================================================
    // 4. SPEAKER NOTES HANDOUT & MARKDOWN EXPORT
    // =========================================================================

    /**
     * Set or store speaker notes for a slide index
     * @param {number} slideIndex
     * @param {string} notes
     */
    setSpeakerNotes(slideIndex, notes) {
      const index = parseInt(slideIndex, 10);
      this.speakerNotes.set(index, String(notes || ''));
    }

    /**
     * Get speaker notes for a slide index
     * @param {number} slideIndex
     * @returns {string}
     */
    getSpeakerNotes(slideIndex) {
      const index = parseInt(slideIndex, 10);
      return this.speakerNotes.get(index) || '';
    }

    /**
     * Gather speaker notes across all slides from internal storage, deck notes, or browser localStorage
     * @param {Object} [options]
     * @returns {Array<{ slide: number, title: string, notes: string }>}
     */
    gatherSpeakerNotes(options = {}) {
      const activeDeck = this.getActiveDeck();
      const docTitle = options.documentTitle || (activeDeck ? activeDeck.title : 'Presentation');
      const slideCount = options.slideCount || (activeDeck ? activeDeck.slideCount : Math.max(1, this.speakerNotes.size));

      const gathered = [];

      for (let p = 1; p <= slideCount; p++) {
        let notesText = '';

        // 1. Check direct internal storage
        if (this.speakerNotes.has(p)) {
          notesText = this.speakerNotes.get(p);
        }

        // 2. Check active deck notes array
        if (!notesText && activeDeck && Array.isArray(activeDeck.notes)) {
          const matched = activeDeck.notes.find(n => n.slide === p || n.page === p);
          if (matched && matched.notes) {
            notesText = matched.notes;
          }
        }

        // 3. In browser, fallback to localStorage (`pdf_notes_${documentTitle}_p${page}`)
        if (!notesText && typeof localStorage !== 'undefined') {
          try {
            const lsKey = `pdf_notes_${docTitle}_p${p}`;
            const stored = localStorage.getItem(lsKey);
            if (stored) notesText = stored;
          } catch (e) {}
        }

        // Title lookup
        let slideTitle = `Slide ${p}`;
        if (this.slideDwellTimes.has(p)) {
          slideTitle = this.slideDwellTimes.get(p).title;
        }

        gathered.push({
          slide: p,
          title: slideTitle,
          notes: (notesText || '').trim()
        });
      }

      return gathered;
    }

    /**
     * Export clean, publication-ready Speaker Notes Markdown handout (Pro only)
     * @param {Object} [options]
     * @param {string} [options.documentTitle]
     * @param {string} [options.speaker]
     * @param {string} [options.timestamp]
     * @param {Array<{ slide: number, title?: string, notes: string }>} [options.slides]
     * @returns {Object} { success: true, markdown: string, slideCount: number, timestamp: string }
     */
    exportSpeakerNotesMarkdown(options = {}) {
      const gate = this._checkProGate('Speaker Notes Markdown Export');
      if (gate) return gate;

      const activeDeck = this.getActiveDeck();
      const documentTitle = options.documentTitle || options.title || (activeDeck ? activeDeck.title : 'Executive Keynote');
      const speaker = options.speaker || (activeDeck && activeDeck.speaker ? activeDeck.speaker : 'Presenter');
      const timestamp = options.timestamp || new Date().toLocaleString();

      const slides = Array.isArray(options.slides) && options.slides.length > 0
        ? options.slides
        : this.gatherSpeakerNotes({ documentTitle, slideCount: options.slideCount });

      let md = '';
      md += `# 📝 Speaker Notes Handout: ${documentTitle}\n\n`;
      md += `**Presentation:** ${documentTitle}  \n`;
      md += `**Speaker:** ${speaker}  \n`;
      md += `**Generated:** ${timestamp}  \n`;
      md += `**Total Slides:** ${slides.length}  \n\n`;
      md += `---\n\n`;

      for (const s of slides) {
        const titleStr = s.title ? `${s.title}` : `Slide ${s.slide}`;
        md += `### Slide ${s.slide}: ${titleStr}\n\n`;

        if (s.notes && s.notes.trim()) {
          // Format notes with clean blockquote formatting
          const quotedNotes = s.notes.trim().split('\n').map(l => `> ${l}`).join('\n');
          md += `${quotedNotes}\n\n`;
        } else {
          md += `> *(No private speaker notes recorded for this slide)*\n\n`;
        }

        md += `---\n\n`;
      }

      const result = {
        success: true,
        markdown: md,
        slideCount: slides.length,
        timestamp
      };

      result.toString = () => md;
      return result;
    }

    /**
     * Export downloadable plain-text handout (Pro only)
     * @param {Object} [options]
     * @returns {Object} { success: true, text: string, slideCount: number, timestamp: string }
     */
    exportSpeakerNotesText(options = {}) {
      const gate = this._checkProGate('Speaker Notes Text Handout Export');
      if (gate) return gate;

      const activeDeck = this.getActiveDeck();
      const documentTitle = options.documentTitle || options.title || (activeDeck ? activeDeck.title : 'Executive Keynote');
      const speaker = options.speaker || (activeDeck && activeDeck.speaker ? activeDeck.speaker : 'Presenter');
      const timestamp = options.timestamp || new Date().toLocaleString();

      const slides = Array.isArray(options.slides) && options.slides.length > 0
        ? options.slides
        : this.gatherSpeakerNotes({ documentTitle, slideCount: options.slideCount });

      const banner = '='.repeat(80);
      const subBanner = '-'.repeat(80);

      let txt = `${banner}\r\n`;
      txt += `SPEAKER NOTES HANDOUT: ${documentTitle.toUpperCase()}\r\n`;
      txt += `Speaker: ${speaker} | Generated: ${timestamp} | Slides: ${slides.length}\r\n`;
      txt += `${banner}\r\n\r\n`;

      for (const s of slides) {
        const titleStr = s.title ? `${s.title}` : `Slide ${s.slide}`;
        txt += `${subBanner}\r\n`;
        txt += `SLIDE ${s.slide}: ${titleStr}\r\n`;
        txt += `${subBanner}\r\n`;

        if (s.notes && s.notes.trim()) {
          txt += `${s.notes.trim()}\r\n\r\n`;
        } else {
          txt += `[No private speaker notes recorded for this slide]\r\n\r\n`;
        }
      }

      const result = {
        success: true,
        text: txt,
        slideCount: slides.length,
        timestamp
      };

      result.toString = () => txt;
      return result;
    }

    // =========================================================================
    // 5. STATIC UTILITIES
    // =========================================================================

    /**
     * Format duration in seconds to standard MM:SS or HH:MM:SS string
     * @param {number} totalSeconds
     * @returns {string}
     */
    static formatTime(totalSeconds) {
      const s = Math.max(0, parseInt(totalSeconds, 10) || 0);
      const hours = Math.floor(s / 3600);
      const minutes = Math.floor((s % 3600) / 60);
      const seconds = s % 60;

      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');

      if (hours > 0) {
        const hh = String(hours).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      }
      return `${mm}:${ss}`;
    }

    /**
     * Generate CSS color gradient from dwell intensity (0.0 = blue/cool, 1.0 = amber/hot)
     * @param {number} intensity (0.0 to 1.0)
     * @returns {string}
     */
    static generateHeatmapColor(intensity) {
      const clamped = Math.max(0, Math.min(1, Number(intensity) || 0));
      if (clamped < 0.33) {
        return '#38bdf8'; // Sky blue (brief / normal)
      } else if (clamped < 0.66) {
        return '#818cf8'; // Indigo (balanced dwell)
      } else if (clamped < 0.85) {
        return '#f59e0b'; // Amber (warning / high dwell)
      } else {
        return '#ef4444'; // Red (critical / overtime)
      }
    }
  }

  // Export to browser window
  if (typeof global !== 'undefined') {
    global.PlaylistMetricsEngine = PlaylistMetricsEngine;
  }

  // Export to Node.js / CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaylistMetricsEngine;
    module.exports.PlaylistMetricsEngine = PlaylistMetricsEngine;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
