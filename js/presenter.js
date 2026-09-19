// js/presenter.js - PowerPoint-Style Presenter Console Controller

document.addEventListener('DOMContentLoaded', async () => {
  const engine = new PDFDocumentEngine();
  const syncBus = new PresentationSyncBus('presenter');

  // Application State
  let currentPage = 1;
  let totalPages = 1;
  let documentTitle = 'Interactive Presentation Showcase.pdf';
  let activeTool = 'select'; // 'select' | 'laser' | 'pen'
  let isDrawing = false;
  let penStrokes = [];
  let blankMode = 'none'; // 'none' | 'black' | 'white'

  // Timer State
  let timerSeconds = 0;
  let timerRunning = false;
  let timerInterval = null;

  // DOM Elements
  const docTitleEl = document.getElementById('docTitle');
  const slideCounterEl = document.getElementById('slideCounter');
  const presenterSlideCanvasA = document.getElementById('presenterSlideCanvasA');
  const presenterSlideCanvasB = document.getElementById('presenterSlideCanvasB');
  let activeSlideCanvas = presenterSlideCanvasA;
  let backSlideCanvas = presenterSlideCanvasB;
  let transitionDuration = 1.0;
  let isFirstSlideRender = true;
  let isSlideTransitioning = false;
  let presenterTransitionTimer = null;

  activeSlideCanvas.style.opacity = '1';
  activeSlideCanvas.style.zIndex = '1';
  backSlideCanvas.style.opacity = '0';
  backSlideCanvas.style.zIndex = '1';
  const drawCanvas = document.getElementById('presenterDrawCanvas');
  const nextSlideCanvas = document.getElementById('nextSlideCanvas');
  const noNextSlideMsg = document.getElementById('noNextSlideMsg');
  const thumbnailStrip = document.getElementById('thumbnailStrip');
  const notesTextarea = document.getElementById('notesTextarea');
  const notesSaveStatus = document.getElementById('notesSaveStatus');
  const timerDisplay = document.getElementById('timerDisplay');
  const clockDisplay = document.getElementById('clockDisplay');
  const audienceStatusBadge = document.getElementById('audienceStatusBadge');

  // Tool buttons
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnLaser = document.getElementById('btnLaser');
  const btnPen = document.getElementById('btnPen');
  const btnHighlighter = document.getElementById('btnHighlighter');
  const btnClearDraw = document.getElementById('btnClearDraw');
  const btnBlackout = document.getElementById('btnBlackout');
  const btnWhiteout = document.getElementById('btnWhiteout');
  const btnTimerToggle = document.getElementById('btnTimerToggle');
  const btnTimerReset = document.getElementById('btnTimerReset');
  const btnTimerPresets = document.getElementById('btnTimerPresets');
  const timerPresetsPopover = document.getElementById('timerPresetsPopover');
  const annotationPalette = document.getElementById('annotationPalette');
  const strokeWidthSelector = document.getElementById('strokeWidthSelector');
  const btnCompanion = document.getElementById('btnCompanion');
  const btnGrid = document.getElementById('btnGrid');
  const btnPlaylist = document.getElementById('btnPlaylist');
  const btnRehearsalMetrics = document.getElementById('btnRehearsalMetrics');
  const btnExportNotes = document.getElementById('btnExportNotes');
  const btnShortcuts = document.getElementById('btnShortcuts');
  const btnEndPresentation = document.getElementById('btnEndPresentation');
  const btnTogglePresenterFullscreen = document.getElementById('btnTogglePresenterFullscreen');

  // Modals
  const companionModal = document.getElementById('companionModal');
  const gridModal = document.getElementById('gridModal');
  const shortcutsModal = document.getElementById('shortcutsModal');
  const gridContainer = document.getElementById('gridContainer');
  const playlistModal = document.getElementById('playlistModal');
  const metricsModal = document.getElementById('metricsModal');
  const notesExportModal = document.getElementById('notesExportModal');
  const playlistQueueList = document.getElementById('playlistQueueList');
  const btnAddDeck = document.getElementById('btnAddDeck');
  const playlistFileInput = document.getElementById('playlistFileInput');

  // Smart Countdown & Annotation Engine
  const EngineClass = window.TimerAnnotationEngine || (typeof TimerAnnotationEngine !== 'undefined' ? TimerAnnotationEngine : null);
  const timerEngine = EngineClass ? new EngineClass({
    syncBus: syncBus,
    isPro: () => (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' ? window.UpgradeModal.isPro() : false),
    onProRequired: (feature) => {
      if (window.UpgradeModal && typeof window.UpgradeModal.open === 'function') {
        window.UpgradeModal.open(feature === 'countdown' ? 'timer' : feature);
      }
    }
  }) : null;

  // NDI IP Video Broadcast Engine
  const NdiClass = window.NdiBroadcastEngine || (typeof NdiBroadcastEngine !== 'undefined' ? NdiBroadcastEngine : null);
  const ndiEngine = NdiClass ? new NdiClass({
    syncBus: syncBus,
    isPro: () => (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' ? window.UpgradeModal.isPro() : false),
    onProRequired: () => {
      if (window.UpgradeModal && window.UpgradeModal.open) window.UpgradeModal.open('ndi');
    }
  }) : null;

  // Cinematic Spotlight Engine
  const SpotlightClass = window.SpotlightEngine || (typeof SpotlightEngine !== 'undefined' ? SpotlightEngine : null);
  const spotlightEngine = SpotlightClass ? new SpotlightClass({
    syncBus: syncBus,
    isPro: () => (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' ? window.UpgradeModal.isPro() : false),
    onProRequired: () => {
      if (window.UpgradeModal && window.UpgradeModal.open) window.UpgradeModal.open('spotlight');
    }
  }) : null;

  // OBS & vMix Broadcast Automation Engine
  const AutomationClass = window.BroadcastAutomationEngine || (typeof BroadcastAutomationEngine !== 'undefined' ? BroadcastAutomationEngine : null);
  const automationEngine = AutomationClass ? new AutomationClass({
    syncBus: syncBus,
    isPro: () => (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' ? window.UpgradeModal.isPro() : false),
    onProRequired: () => {
      if (window.UpgradeModal && window.UpgradeModal.open) window.UpgradeModal.open('automation');
    }
  }) : null;

  // Multi-Deck Conference Playlist, Rehearsal Metrics & Notes Export Engine
  const PlaylistMetricsClass = window.PlaylistMetricsEngine || (typeof PlaylistMetricsEngine !== 'undefined' ? PlaylistMetricsEngine : null);
  const playlistEngine = PlaylistMetricsClass ? new PlaylistMetricsClass({
    syncBus: syncBus,
    isPro: () => (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' ? window.UpgradeModal.isPro() : false),
    onDeckSwitch: async (targetDeck) => {
      try {
        if (targetDeck.pdfBuffer) {
          await engine.loadPDFData(targetDeck.pdfBuffer, targetDeck.title);
        } else if (targetDeck.path) {
          await engine.loadPDFFromUrl(targetDeck.path, targetDeck.title);
        } else {
          await engine.loadDemo();
        }
        documentTitle = targetDeck.title;
        docTitleEl.textContent = documentTitle;
        totalPages = engine.totalPages;
        currentPage = 1;
        await renderAllSlidesUI();
        announceA11y(`Switched presentation to ${targetDeck.title}`);
        renderPlaylistQueue();
      } catch (err) {
        console.error('Error switching presentation deck:', err);
      }
    }
  }) : null;

  // Resizable Layout Elements
  const horizontalSplitter = document.getElementById('horizontalSplitter');
  const verticalSplitter = document.getElementById('verticalSplitter');
  const sidebarPanel = document.getElementById('sidebarPanel');
  const nextSlideCard = document.getElementById('nextSlideCard');

  // =========================================================================
  // 1. INITIALIZATION & DATA INGESTION
  // =========================================================================
  function updateSlideCounterBadge() {
    if (slideCounterEl) {
      if (typeof i18n !== 'undefined') {
        slideCounterEl.textContent = i18n.t('presenter.slideCounter', { current: currentPage, total: totalPages });
      } else {
        slideCounterEl.textContent = `Slide ${currentPage} of ${totalPages}`;
      }
    }
  }

  async function init() {
    if (typeof i18n !== 'undefined') {
      const languageSelectPresenter = document.getElementById('languageSelectPresenter');
      if (languageSelectPresenter) {
        i18n.populateLanguageSelector(languageSelectPresenter);
      }
      i18n.applyTranslations();
      window.addEventListener('languageChanged', (e) => {
        i18n.applyTranslations();
        updateSlideCounterBadge();
        if (typeof emitSync === 'function') {
          emitSync({ type: 'SET_LANGUAGE', language: e.detail ? e.detail.language : i18n.getCurrentLanguage() });
        }
      });
    }

    setupEventListeners();
    setupDrawingLayer();
    setupResizableLayout();
    startClock();
    setupIpcListeners();

    if (window.electronAPI && window.electronAPI.getPresentationData) {
      try {
        const data = await window.electronAPI.getPresentationData();
        if (data && data.config) {
          await loadConfiguredDocument(data.config, data.streamUrl, data.pdfData);
          return;
        }
      } catch (err) {
        console.warn('Error retrieving presentation data:', err);
      }
    }

    await loadPresentationDemo();
  }

  async function loadConfiguredDocument(config, streamUrl = null, pdfData = null) {
    if (typeof config.transitionDuration === 'number') {
      transitionDuration = config.transitionDuration;
      document.documentElement.style.setProperty('--transition-duration', `${transitionDuration}s`);
    }

    if (config.isDemo) {
      await loadPresentationDemo();
      return;
    }

    try {
      docTitleEl.textContent = `Loading ${config.title}...`;
      let docInfo;
      if (pdfData) {
        docInfo = await engine.loadPDFData(pdfData, config.title);
      } else if (streamUrl) {
        docInfo = await engine.loadPDFFromUrl(streamUrl, config.title);
      } else {
        const url = 'http://localhost:3000/api/document/current.pdf';
        docInfo = await engine.loadPDFFromUrl(url, config.title);
      }
      documentTitle = docInfo.title;
      totalPages = docInfo.totalPages;
      currentPage = 1;
      updateDocumentHeader();
      await renderAllSlidesUI();
      if (config.playlist && Array.isArray(config.playlist) && config.playlist.length > 0 && playlistEngine) {
        playlistEngine.playlist = config.playlist;
        const active = config.playlist.find(d => d.active) || config.playlist[0];
        if (active) {
          playlistEngine.activeDeckId = active.id;
        }
        if (typeof renderPlaylistQueue === 'function') {
          renderPlaylistQueue();
        }
      }
      syncActiveDeckToPlaylist();
    } catch (err) {
      console.error('Error loading passed PDF in presenter:', err);
      await loadPresentationDemo();
    }
  }

  async function loadPresentationDemo() {
    const docInfo = await engine.loadDemo();
    documentTitle = docInfo.title;
    totalPages = docInfo.totalPages;
    currentPage = 1;
    updateDocumentHeader();
    await renderAllSlidesUI();
    syncActiveDeckToPlaylist();
  }

  function syncActiveDeckToPlaylist() {
    if (!playlistEngine) return;
    if (playlistEngine.getPlaylist().length === 0) {
      playlistEngine.addDeck({
        id: 'deck_1',
        title: documentTitle,
        slideCount: totalPages,
        active: true,
        speaker: 'Lead Presenter'
      });
    }
    playlistEngine.startTracking(1, `Slide 1`);
  }

  function updateDocumentHeader() {
    docTitleEl.textContent = documentTitle;
    docTitleEl.title = documentTitle;
    slideCounterEl.textContent = `Slide ${currentPage} of ${totalPages}`;
  }

  // =========================================================================
  // 2. SLIDE RENDERING & DUAL-SCREEN VIEWS
  // =========================================================================
  async function renderAllSlidesUI() {
    await renderCurrentSlide();
    await renderNextSlidePreview();
    renderThumbnailsStrip();
    loadSpeakerNotesForCurrentSlide();
  }

  function finishPresenterTransitionImmediately() {
    if (presenterTransitionTimer) {
      clearTimeout(presenterTransitionTimer);
      presenterTransitionTimer = null;
    }
    isSlideTransitioning = false;
    activeSlideCanvas.style.transition = 'none';
    backSlideCanvas.style.transition = 'none';
    activeSlideCanvas.style.opacity = '1';
    activeSlideCanvas.style.zIndex = '1';
    backSlideCanvas.style.opacity = '0';
    backSlideCanvas.style.zIndex = '1';
    activeSlideCanvas.className = 'presenter-slide-canvas active';
    backSlideCanvas.className = 'presenter-slide-canvas';
    void activeSlideCanvas.offsetWidth;
  }

  async function renderCurrentSlide() {
    updateSlideCounterBadge();

    if (isSlideTransitioning) {
      finishPresenterTransitionImmediately();
    }

    const area = document.getElementById('currentSlideArea') || document.querySelector('.slide-canvas-wrapper');
    const targetW = (area && area.clientWidth > 100 ? area.clientWidth - 40 : 960);
    const targetH = (area && area.clientHeight > 100 ? area.clientHeight - 40 : 540);

    if (isFirstSlideRender || transitionDuration === 0) {
      await engine.renderPageToCanvas(currentPage, activeSlideCanvas, {
        width: targetW,
        height: targetH,
        scale: 2.0
      });
      activeSlideCanvas.style.transition = 'none';
      activeSlideCanvas.style.opacity = '1';
      activeSlideCanvas.style.zIndex = '1';
      activeSlideCanvas.className = 'presenter-slide-canvas active';

      backSlideCanvas.style.transition = 'none';
      backSlideCanvas.style.opacity = '0';
      backSlideCanvas.style.zIndex = '1';
      backSlideCanvas.className = 'presenter-slide-canvas';

      isFirstSlideRender = false;
      resizeDrawingCanvas();
      redrawPenStrokes();
      return;
    }

    // Render new slide off-screen into backSlideCanvas while hidden
    backSlideCanvas.style.transition = 'none';
    backSlideCanvas.style.opacity = '0';
    backSlideCanvas.style.zIndex = '1';
    backSlideCanvas.className = 'presenter-slide-canvas';

    await engine.renderPageToCanvas(currentPage, backSlideCanvas, {
      width: targetW,
      height: targetH,
      scale: 2.0
    });
    void backSlideCanvas.offsetWidth;

    // Dissolve transition: back sits on top (zIndex 2), active stays underneath (zIndex 1)
    isSlideTransitioning = true;
    backSlideCanvas.style.zIndex = '2';
    activeSlideCanvas.style.zIndex = '1';
    activeSlideCanvas.style.opacity = '1';

    backSlideCanvas.style.transition = `opacity ${transitionDuration}s ease-in-out`;
    backSlideCanvas.style.opacity = '1';
    backSlideCanvas.className = 'presenter-slide-canvas active';
    activeSlideCanvas.className = 'presenter-slide-canvas';

    const outgoing = activeSlideCanvas;
    activeSlideCanvas = backSlideCanvas;
    backSlideCanvas = outgoing;

    presenterTransitionTimer = setTimeout(() => {
      isSlideTransitioning = false;
      backSlideCanvas.style.transition = 'none';
      backSlideCanvas.style.opacity = '0';
      backSlideCanvas.style.zIndex = '1';
      activeSlideCanvas.style.zIndex = '1';
      presenterTransitionTimer = null;
    }, transitionDuration * 1000);

    resizeDrawingCanvas();
    redrawPenStrokes();
  }

  async function renderNextSlidePreview() {
    if (currentPage < totalPages) {
      nextSlideCanvas.style.display = 'block';
      noNextSlideMsg.style.display = 'none';
      const viewport = document.querySelector('.next-slide-viewport');
      const w = viewport && viewport.clientWidth > 50 ? viewport.clientWidth - 16 : 400;
      const h = viewport && viewport.clientHeight > 50 ? viewport.clientHeight - 16 : 225;
      await engine.renderPageToCanvas(currentPage + 1, nextSlideCanvas, { width: w, height: h, scale: 2.0 });
    } else {
      nextSlideCanvas.style.display = 'none';
      noNextSlideMsg.style.display = 'block';
      noNextSlideMsg.textContent = 'End of presentation';
    }
  }

  function renderThumbnailsStrip() {
    thumbnailStrip.innerHTML = '';
    for (let p = 1; p <= totalPages; p++) {
      const item = document.createElement('div');
      item.className = `thumb-item ${p === currentPage ? 'active' : ''}`;
      item.dataset.page = p;

      const canvas = document.createElement('canvas');
      item.appendChild(canvas);

      const numBadge = document.createElement('div');
      numBadge.className = 'thumb-number';
      numBadge.textContent = p;
      item.appendChild(numBadge);

      item.addEventListener('click', () => goToPage(p));
      thumbnailStrip.appendChild(item);

      engine.renderThumbnail(p, canvas, 160);
    }
    scrollActiveThumbnailIntoView();
  }

  function scrollActiveThumbnailIntoView() {
    const activeThumb = thumbnailStrip.querySelector(`.thumb-item[data-page="${currentPage}"]`);
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function announceA11y(message) {
    const announcer = document.getElementById('a11yLiveAnnouncer');
    if (announcer) {
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = message; }, 50);
    }
  }

  // =========================================================================
  // 3. NAVIGATION (NEXT, PREV, GOTO)
  // =========================================================================
  async function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > totalPages || pageNum === currentPage) return;
    currentPage = pageNum;

    // Immediately notify audience window so transition starts simultaneously
    emitSync({ type: 'PAGE_CHANGED', page: currentPage });

    if (playlistEngine) {
      playlistEngine.recordSlideTransition(currentPage, `Slide ${currentPage}`);
    }

    clearLaserPointer();
    clearPenAnnotations();
    updateThumbnailSelection();
    await renderCurrentSlide();
    await renderNextSlidePreview();
    loadSpeakerNotesForCurrentSlide();
    announceA11y(`Slide ${currentPage} of ${totalPages}`);
  }

  function nextPage() {
    if (currentPage < totalPages) goToPage(currentPage + 1);
  }

  function prevPage() {
    if (currentPage > 1) goToPage(currentPage - 1);
  }

  function updateThumbnailSelection() {
    thumbnailStrip.querySelectorAll('.thumb-item').forEach(item => {
      item.classList.toggle('active', Number(item.dataset.page) === currentPage);
    });
    scrollActiveThumbnailIntoView();
  }

  function emitSync(msg) {
    if (window.electronAPI && window.electronAPI.sendSync) {
      window.electronAPI.sendSync(msg);
    }
    if (typeof syncBus !== 'undefined' && syncBus) {
      syncBus.send(msg);
    }
  }

  // =========================================================================
  // 4. SPEAKER NOTES (LOCALSTORAGE AUTO-SAVE)
  // =========================================================================
  function getNotesKey(page) {
    return `pdf_notes_${documentTitle}_p${page}`;
  }

  function loadSpeakerNotesForCurrentSlide() {
    const customNotes = localStorage.getItem(getNotesKey(currentPage));
    if (customNotes !== null) {
      notesTextarea.value = customNotes;
    } else {
      notesTextarea.value = engine.getSpeakerNotes(currentPage) || '';
    }
    notesSaveStatus.textContent = 'Notes loaded';
    if (playlistEngine) {
      playlistEngine.setSpeakerNotes(currentPage, notesTextarea.value);
    }
    emitSync({
      type: 'UPDATE_NOTES',
      currentPage: currentPage,
      currentNote: notesTextarea.value
    });
  }

  let notesSaveTimeout = null;
  notesTextarea.addEventListener('input', () => {
    notesSaveStatus.textContent = 'Saving notes...';
    clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(() => {
      localStorage.setItem(getNotesKey(currentPage), notesTextarea.value);
      notesSaveStatus.textContent = 'All changes auto-saved';
      if (playlistEngine) {
        playlistEngine.setSpeakerNotes(currentPage, notesTextarea.value);
      }
      emitSync({
        type: 'UPDATE_NOTES',
        currentPage: currentPage,
        currentNote: notesTextarea.value
      });
    }, 500);
  });

  // =========================================================================
  // 5. PRESENTATION TOOLS: LASER & DIGITAL PEN
  // =========================================================================
  let presenterResizeTimer = null;
  function setupDrawingLayer() {
    window.addEventListener('resize', () => {
      resizeDrawingCanvas();
      clearTimeout(presenterResizeTimer);
      presenterResizeTimer = setTimeout(() => {
        renderCurrentSlide();
        renderNextSlidePreview();
      }, 150);
    });
  }

  function resizeDrawingCanvas() {
    const w = activeSlideCanvas.clientWidth || parseInt(activeSlideCanvas.style.width) || 800;
    const h = activeSlideCanvas.clientHeight || parseInt(activeSlideCanvas.style.height) || 450;
    drawCanvas.width = w;
    drawCanvas.height = h;
    drawCanvas.style.width = `${w}px`;
    drawCanvas.style.height = `${h}px`;
    drawCanvas.style.left = '50%';
    drawCanvas.style.top = '50%';
    drawCanvas.style.transform = 'translate(-50%, -50%)';

    const presenterSpotlightCanvas = document.getElementById('presenterSpotlightCanvas');
    if (presenterSpotlightCanvas) {
      presenterSpotlightCanvas.width = w;
      presenterSpotlightCanvas.height = h;
      presenterSpotlightCanvas.style.width = `${w}px`;
      presenterSpotlightCanvas.style.height = `${h}px`;
      presenterSpotlightCanvas.style.left = '50%';
      presenterSpotlightCanvas.style.top = '50%';
      presenterSpotlightCanvas.style.transform = 'translate(-50%, -50%)';
      renderPresenterSpotlight();
    }
  }

  function renderPresenterSpotlight() {
    const presenterSpotlightCanvas = document.getElementById('presenterSpotlightCanvas');
    if (!presenterSpotlightCanvas || !spotlightEngine) return;
    const ctx = presenterSpotlightCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, presenterSpotlightCanvas.width, presenterSpotlightCanvas.height);
    if (spotlightEngine.state && spotlightEngine.state.enabled) {
      spotlightEngine.render(ctx, presenterSpotlightCanvas.width, presenterSpotlightCanvas.height);
    }
  }

  function toggleSpotlightMode() {
    if (!spotlightEngine) return;
    if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro()) {
      window.UpgradeModal.open('spotlight');
      return;
    }
    spotlightEngine.toggle();
    const isEnabled = spotlightEngine.state.enabled;
    const btnSpotlight = document.getElementById('btnSpotlight');
    if (btnSpotlight) btnSpotlight.classList.toggle('active', isEnabled);
    emitSync({
      type: 'SPOTLIGHT_TOGGLE',
      enabled: isEnabled
    });
    renderPresenterSpotlight();
    announceA11y(isEnabled ? 'Cinematic Spotlight active' : 'Spotlight mode off');
  }

  function broadcastCurrentFrameToNdi() {
    if (!ndiEngine || !ndiEngine.state.isBroadcasting || !activeSlideCanvas) return;
    try {
      const dataUrl = activeSlideCanvas.toDataURL('image/jpeg', 0.85);
      ndiEngine.sendFrame(dataUrl, 'program');
    } catch (e) {}
  }

  function setTool(toolName) {
    if (toolName === 'highlighter' && timerEngine) {
      const res = timerEngine.setTool('highlighter');
      if (!res.success) return;
    } else if (timerEngine) {
      timerEngine.setTool(toolName);
    }

    activeTool = toolName;
    btnLaser.classList.toggle('btn-active', activeTool === 'laser');
    btnPen.classList.toggle('btn-active', activeTool === 'pen');
    if (btnHighlighter) btnHighlighter.classList.toggle('btn-active', activeTool === 'highlighter');
    if (activeTool !== 'laser') clearLaserPointer();
  }

  drawCanvas.addEventListener('mousemove', (e) => {
    const rect = drawCanvas.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    if (activeTool === 'laser') {
      renderLaserOnPresenter(e.clientX - rect.left, e.clientY - rect.top);
      emitSync({ type: 'LASER_MOVED', x: xPct, y: yPct, visible: true });
    } else if ((activeTool === 'pen' || activeTool === 'highlighter') && isDrawing) {
      penStrokes.push({ x: xPct, y: yPct });
      if (timerEngine) timerEngine.addPoint({ x: xPct, y: yPct });
      else emitSync({ type: 'PEN_POINT', point: { x: xPct, y: yPct } });
      drawPenSegment(xPct, yPct);
    }
  });

  drawCanvas.addEventListener('mouseleave', () => {
    if (activeTool === 'laser') clearLaserPointer();
    if (isDrawing) {
      isDrawing = false;
      if (timerEngine) timerEngine.endStroke();
      else emitSync({ type: 'PEN_UP' });
    }
  });

  drawCanvas.addEventListener('mousedown', (e) => {
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      isDrawing = true;
      const rect = drawCanvas.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;
      penStrokes = [{ x: xPct, y: yPct }];
      if (timerEngine) {
        timerEngine.startStroke({ x: xPct, y: yPct });
      } else {
        emitSync({ type: 'PEN_DOWN', point: { x: xPct, y: yPct } });
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDrawing) {
      isDrawing = false;
      if (timerEngine) timerEngine.endStroke();
      else emitSync({ type: 'PEN_UP' });
    }
  });

  function renderLaserOnPresenter(x, y) {
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    redrawPenStrokes();

    ctx.save();
    ctx.fillStyle = '#ff2a2a';
    ctx.shadowColor = 'rgba(255, 42, 42, 0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function clearLaserPointer() {
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    redrawPenStrokes();
    emitSync({ type: 'LASER_MOVED', visible: false });
  }

  function drawPenSegment(xPct, yPct) {
    const ctx = drawCanvas.getContext('2d');
    const props = timerEngine ? timerEngine.annotations.getEffectiveStrokeProps() : { rgba: '#eab308', width: 5 };
    ctx.save();
    ctx.strokeStyle = props.rgba || '#eab308';
    ctx.lineWidth = props.width || 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (penStrokes.length >= 2) {
      const p1 = penStrokes[penStrokes.length - 2];
      const p2 = penStrokes[penStrokes.length - 1];
      ctx.beginPath();
      ctx.moveTo(p1.x * drawCanvas.width, p1.y * drawCanvas.height);
      ctx.lineTo(p2.x * drawCanvas.width, p2.y * drawCanvas.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function redrawPenStrokes() {
    const ctx = drawCanvas.getContext('2d');
    if (timerEngine && timerEngine.annotations && timerEngine.annotations.allStrokes.length > 0) {
      timerEngine.annotations.allStrokes.forEach(stroke => {
        if (!stroke.points || stroke.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = stroke.rgba || stroke.color || '#eab308';
        ctx.lineWidth = stroke.width || 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x * drawCanvas.width, stroke.points[0].y * drawCanvas.height);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x * drawCanvas.width, stroke.points[i].y * drawCanvas.height);
        }
        ctx.stroke();
        ctx.restore();
      });
    } else if (penStrokes.length >= 2) {
      ctx.save();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(penStrokes[0].x * drawCanvas.width, penStrokes[0].y * drawCanvas.height);
      for (let i = 1; i < penStrokes.length; i++) {
        ctx.lineTo(penStrokes[i].x * drawCanvas.width, penStrokes[i].y * drawCanvas.height);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function clearPenAnnotations() {
    penStrokes = [];
    if (timerEngine) timerEngine.clearAnnotations();
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    emitSync({ type: 'CLEAR_PEN' });
  }

  // =========================================================================
  // 6. SCREEN BLANKING (BLACKOUT / WHITEOUT)
  // =========================================================================
  function setBlankMode(mode) {
    blankMode = blankMode === mode ? 'none' : mode;
    btnBlackout.classList.toggle('btn-active', blankMode === 'black');
    btnWhiteout.classList.toggle('btn-active', blankMode === 'white');
    emitSync({ type: 'SET_BLANK', mode: blankMode });
    announceA11y(blankMode === 'none' ? 'Audience screen restored' : `${blankMode} screen curtain active`);
  }

  // =========================================================================
  // 7. TIMER & DIGITAL CLOCK
  // =========================================================================
  function startClock() {
    const updateClock = () => {
      const now = new Date();
      clockDisplay.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  function toggleTimer() {
    if (timerEngine) {
      if (timerEngine.timer.running) pauseTimer();
      else startTimer();
    } else {
      if (timerRunning) pauseTimer();
      else startTimer();
    }
  }

  function startTimer() {
    if (timerEngine) {
      timerEngine.startTimer();
      updateTimerUI();
    } else {
      if (timerRunning) return;
      timerRunning = true;
      btnTimerToggle.textContent = '⏸️';
      btnTimerToggle.title = 'Pause Timer';
      timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerUI();
      }, 1000);
    }
  }

  function pauseTimer() {
    if (timerEngine) {
      timerEngine.pauseTimer();
      updateTimerUI();
    } else {
      timerRunning = false;
      btnTimerToggle.textContent = '▶️';
      btnTimerToggle.title = 'Start Timer';
      clearInterval(timerInterval);
    }
  }

  function resetTimer() {
    if (timerEngine) {
      timerEngine.resetTimer();
      updateTimerUI();
    } else {
      pauseTimer();
      timerSeconds = 0;
      updateTimerUI();
    }
  }

  function updateTimerUI(providedState) {
    if (timerEngine) {
      const st = providedState || timerEngine.getTimerState();
      timerSeconds = st.timerSeconds;
      timerRunning = st.timerRunning;
      timerDisplay.textContent = st.formatted;
      timerDisplay.className = `timer-display phase-${st.phase}`;
      btnTimerToggle.textContent = st.timerRunning ? '⏸️' : '▶️';
      btnTimerToggle.title = st.timerRunning ? 'Pause Timer' : 'Start Timer';
      emitSync({
        type: 'TIMER_TICK',
        timerDisplay: st.formatted,
        timerPhase: st.phase,
        timerSeconds: st.timerSeconds,
        timerRunning: st.timerRunning
      });
    } else {
      const m = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2, '0');
      const s = (timerSeconds % 60).toString().padStart(2, '0');
      timerDisplay.textContent = `${m}:${s}`;
      emitSync({
        type: 'TIMER_TICK',
        timerDisplay: `${m}:${s}`,
        timerPhase: 'normal',
        timerSeconds: timerSeconds,
        timerRunning: timerRunning
      });
    }
  }

  if (timerEngine) {
    timerEngine.timer.onChange((st) => {
      updateTimerUI(st);
    });
  }

  // =========================================================================
  // 8. EXIT PRESENTATION WORKFLOW
  // =========================================================================
  function handleEndPresentation() {
    if (window.electronAPI && window.electronAPI.endPresentation) {
      window.electronAPI.endPresentation();
    } else {
      window.location.href = 'launcher.html';
    }
  }

  // =========================================================================
  // 9. IPC & COMPANION SYNC LISTENERS & COCKPIT LIVE MESSAGES
  // =========================================================================
  let presenterCueTimerId = null;
  let presenterCueCountdownInterval = null;

  function showPresenterCockpitAlert(message, durationMs = 10000, tag = 'STREAM DECK') {
    const banner = document.getElementById('presenterStageCueBanner');
    const textEl = document.getElementById('presenterStageCueText');
    const tagEl = document.getElementById('presenterStageCueTag');
    const timerEl = document.getElementById('presenterStageCueTimer');
    if (!banner || !textEl) return;

    if (presenterCueTimerId) clearTimeout(presenterCueTimerId);
    if (presenterCueCountdownInterval) clearInterval(presenterCueCountdownInterval);

    textEl.textContent = message;
    if (tagEl) tagEl.textContent = tag;

    let remainingSec = Math.ceil(durationMs / 1000);
    if (timerEl) {
      timerEl.style.display = durationMs > 0 ? 'inline-block' : 'none';
      timerEl.textContent = `${remainingSec}s`;
    }

    banner.style.display = 'block';

    if (durationMs > 0) {
      presenterCueCountdownInterval = setInterval(() => {
        remainingSec--;
        if (timerEl) timerEl.textContent = `${Math.max(0, remainingSec)}s`;
        if (remainingSec <= 0) {
          clearInterval(presenterCueCountdownInterval);
        }
      }, 1000);

      presenterCueTimerId = setTimeout(() => {
        dismissPresenterCockpitAlert();
      }, durationMs);
    }
  }

  function dismissPresenterCockpitAlert() {
    const banner = document.getElementById('presenterStageCueBanner');
    if (banner) banner.style.display = 'none';
    if (presenterCueTimerId) {
      clearTimeout(presenterCueTimerId);
      presenterCueTimerId = null;
    }
    if (presenterCueCountdownInterval) {
      clearInterval(presenterCueCountdownInterval);
      presenterCueCountdownInterval = null;
    }
  }

  const btnDismissPresenterCue = document.getElementById('btnDismissPresenterCue');
  if (btnDismissPresenterCue) {
    btnDismissPresenterCue.addEventListener('click', dismissPresenterCockpitAlert);
  }

  function setupIpcListeners() {
    const handleRemoteEvent = (data) => {
      if (!data) return;
      if (data.type === 'GOTO_PAGE' || data.type === 'PAGE_CHANGED') {
        goToPage(Number(data.page));
      } else if (data.type === 'SET_BLANK') {
        blankMode = data.mode;
        btnBlackout.classList.toggle('btn-active', blankMode === 'black');
        btnWhiteout.classList.toggle('btn-active', blankMode === 'white');
      } else if (data.type === 'TIMER_CONTROL') {
        if (data.action === 'start') startTimer();
        else if (data.action === 'pause') pauseTimer();
        else if (data.action === 'reset') resetTimer();
      } else if (data.type === 'SET_LANGUAGE') {
        if (typeof i18n !== 'undefined' && data.language && i18n.getCurrentLanguage() !== data.language) {
          i18n.setLanguage(data.language);
        }
      } else if (data.type === 'PRESENTER_ALERT') {
        const dur = data.duration !== undefined ? Number(data.duration) : 10000;
        showPresenterCockpitAlert(data.message, dur, data.source === 'companion_api' ? 'STREAM DECK' : 'LIVE MESSAGE');
      } else if (data.type === 'CLEAR_PRESENTER_ALERT') {
        dismissPresenterCockpitAlert();
      } else if (data.type === 'STAGE_CUE') {
        if (!data.message) {
          dismissPresenterCockpitAlert();
        } else if (data.target === 'presenter' || data.target === 'cockpit' || data.target === 'all') {
          const dur = data.duration !== undefined ? Number(data.duration) : 10000;
          showPresenterCockpitAlert(data.message, dur, 'STAGE ALERT');
        }
      }
    };

    if (window.electronAPI && window.electronAPI.onSync) {
      window.electronAPI.onSync(handleRemoteEvent);
    }
    if (window.electronAPI && window.electronAPI.onDisplaysChanged) {
      window.electronAPI.onDisplaysChanged((data) => {
        console.log('[Presenter] Displays changed event received:', data);
        if (data && data.changeType === 'display-added' && audienceStatusBadge) {
          audienceStatusBadge.textContent = 'HDMI Screen Connected';
          audienceStatusBadge.style.color = '#38bdf8';
          setTimeout(() => {
            audienceStatusBadge.textContent = 'Audience Screen Active';
            audienceStatusBadge.style.color = '';
          }, 4000);
        }
      });
    }
    if (typeof syncBus !== 'undefined' && syncBus) {
      syncBus.on('GOTO_PAGE', handleRemoteEvent);
      syncBus.on('SET_BLANK', handleRemoteEvent);
      syncBus.on('TIMER_CONTROL', handleRemoteEvent);
      syncBus.on('SET_LANGUAGE', handleRemoteEvent);
      syncBus.on('PRESENTER_ALERT', handleRemoteEvent);
      syncBus.on('CLEAR_PRESENTER_ALERT', handleRemoteEvent);
      syncBus.on('STAGE_CUE', handleRemoteEvent);
    }
  }

  // =========================================================================
  // 10. COMPANION MODAL & SLIDE GRID
  // =========================================================================
  async function openCompanionModal() {
    companionModal.classList.add('open');
    if (window.electronAPI && window.electronAPI.getCompanionInfo) {
      const info = await window.electronAPI.getCompanionInfo();
      const ipContainer = document.getElementById('companionIpList');
      if (ipContainer) {
        if (!info.enabled || !info.running) {
          ipContainer.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 6px; padding: 10px 12px; color: #fca5a5; font-size: 12px; line-height: 1.5;">
              ⚠️ <strong>Remote Control API is currently disabled.</strong><br>
              To control slides from Bitfocus Companion, Stream Deck, or external network devices, enable the API toggle in the Launcher settings.
            </div>
          `;
          return;
        }

        const baseUrls = [];
        if (info.host && info.host !== '0.0.0.0') {
          baseUrls.push(info.host);
        } else if (info.localIPs && info.localIPs.length > 0) {
          baseUrls.push(...info.localIPs);
        } else {
          baseUrls.push('127.0.0.1');
        }

        ipContainer.innerHTML = baseUrls.map(ip => `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; background: rgba(0,0,0,0.25); padding: 4px 8px; border-radius: 4px;">
            <code>http://${ip}:${info.port}/api/</code>
            <button type="button" class="btn-copy" data-clipboard="http://${ip}:${info.port}/api/">📋 Copy</button>
          </div>
        `).join('');
        wireCopyButtons();
      }
    }
  }

  function openSlideGridModal() {
    if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro()) {
      window.UpgradeModal.open('grid');
      return;
    }

    gridContainer.innerHTML = '';
    gridModal.classList.add('open');

    for (let p = 1; p <= totalPages; p++) {
      const card = document.createElement('div');
      card.className = `grid-slide-card ${p === currentPage ? 'active' : ''}`;
      card.dataset.page = p;

      const canvas = document.createElement('canvas');
      card.appendChild(canvas);

      const numBadge = document.createElement('div');
      numBadge.className = 'thumb-number';
      numBadge.textContent = `Slide ${p}`;
      card.appendChild(numBadge);

      card.addEventListener('click', () => {
        goToPage(p);
        gridModal.classList.remove('open');
      });

      gridContainer.appendChild(card);
      engine.renderThumbnail(p, canvas, 240);
    }
  }

  // =========================================================================
  // 11. EVENT LISTENERS & SHORTCUTS
  // =========================================================================
  function setupEventListeners() {
    btnNext.addEventListener('click', nextPage);
    btnPrev.addEventListener('click', prevPage);
    document.getElementById('navZoneNext').addEventListener('click', nextPage);
    document.getElementById('navZonePrev').addEventListener('click', prevPage);

    btnLaser.addEventListener('click', () => setTool(activeTool === 'laser' ? 'select' : 'laser'));
    btnPen.addEventListener('click', () => setTool(activeTool === 'pen' ? 'select' : 'pen'));
    if (btnHighlighter) {
      btnHighlighter.addEventListener('click', () => setTool(activeTool === 'highlighter' ? 'select' : 'highlighter'));
    }

    if (annotationPalette) {
      annotationPalette.querySelectorAll('.palette-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
          const color = swatch.dataset.color;
          if (timerEngine) {
            const res = timerEngine.setColor(color);
            if (res.success) {
              annotationPalette.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('active'));
              swatch.classList.add('active');
              if (activeTool !== 'pen' && activeTool !== 'highlighter') {
                setTool('pen');
              }
            }
          }
        });
      });
    }

    if (strokeWidthSelector) {
      strokeWidthSelector.querySelectorAll('.width-btn').forEach(wBtn => {
        wBtn.addEventListener('click', () => {
          const w = Number(wBtn.dataset.width);
          if (timerEngine) {
            const res = timerEngine.setWidth(w);
            if (res.success) {
              strokeWidthSelector.querySelectorAll('.width-btn').forEach(b => b.classList.remove('active'));
              wBtn.classList.add('active');
            }
          }
        });
      });
    }

    btnClearDraw.addEventListener('click', clearPenAnnotations);
    btnBlackout.addEventListener('click', () => setBlankMode('black'));
    btnWhiteout.addEventListener('click', () => setBlankMode('white'));

    btnTimerToggle.addEventListener('click', toggleTimer);
    btnTimerReset.addEventListener('click', resetTimer);

    if (btnTimerPresets && timerPresetsPopover) {
      btnTimerPresets.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = timerPresetsPopover.style.display !== 'none';
        timerPresetsPopover.style.display = isOpen ? 'none' : 'flex';
      });

      document.addEventListener('click', (e) => {
        if (timerPresetsPopover && !timerPresetsPopover.contains(e.target) && e.target !== btnTimerPresets) {
          timerPresetsPopover.style.display = 'none';
        }
      });

      const countupBtn = document.getElementById('btnPresetCountup');
      if (countupBtn) {
        countupBtn.addEventListener('click', () => {
          if (timerEngine) timerEngine.setTimerMode('countup');
          timerPresetsPopover.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
          countupBtn.classList.add('active');
          timerPresetsPopover.style.display = 'none';
          updateTimerUI();
        });
      }

      timerPresetsPopover.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const preset = chip.dataset.preset;
          if (timerEngine) {
            const ok = timerEngine.setPreset(preset);
            if (ok) {
              timerPresetsPopover.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
              if (countupBtn) countupBtn.classList.remove('active');
              chip.classList.add('active');
              timerPresetsPopover.style.display = 'none';
              updateTimerUI();
            }
          }
        });
      });
    }

    // Consolidated Pro Tools Dropdown Popover Menu
    const btnProToolsMenu = document.getElementById('btnProToolsMenu');
    const proToolsMenuPopover = document.getElementById('proToolsMenuPopover');

    if (btnProToolsMenu && proToolsMenuPopover) {
      btnProToolsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = proToolsMenuPopover.style.display !== 'none';
        proToolsMenuPopover.style.display = isOpen ? 'none' : 'block';
        btnProToolsMenu.classList.toggle('active', !isOpen);
        btnProToolsMenu.setAttribute('aria-expanded', String(!isOpen));
      });

      document.addEventListener('click', (e) => {
        if (proToolsMenuPopover && !proToolsMenuPopover.contains(e.target) && e.target !== btnProToolsMenu) {
          proToolsMenuPopover.style.display = 'none';
          btnProToolsMenu.classList.remove('active');
          btnProToolsMenu.setAttribute('aria-expanded', 'false');
        }
      });

      proToolsMenuPopover.querySelectorAll('.pro-tools-menu-item').forEach(item => {
        item.addEventListener('click', () => {
          proToolsMenuPopover.style.display = 'none';
          btnProToolsMenu.classList.remove('active');
          btnProToolsMenu.setAttribute('aria-expanded', 'false');
        });
      });
    }

    if (btnCompanion) {
      btnCompanion.addEventListener('click', openCompanionModal);
    }

    const handleGridRequest = (e) => {
      if (e) e.preventDefault();
      if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro()) {
        window.UpgradeModal.open('grid');
        return;
      }
      openSlideGridModal();
    };

    if (btnGrid) btnGrid.addEventListener('click', handleGridRequest);
    const btnGridBottom = document.getElementById('btnGridBottom');
    if (btnGridBottom) btnGridBottom.addEventListener('click', handleGridRequest);

    if (btnPlaylist) {
      btnPlaylist.addEventListener('click', () => openPlaylistModal());
    }

    if (btnRehearsalMetrics) {
      btnRehearsalMetrics.addEventListener('click', () => openMetricsModal());
    }

    if (btnExportNotes) {
      btnExportNotes.addEventListener('click', () => openNotesExportModal());
    }

    // Stage Confidence Monitor Modal & Controls
    const btnConfidenceMonitor = document.getElementById('btnConfidenceMonitor');
    const confidenceModal = document.getElementById('confidenceModal');
    const btnLaunchConfidenceWindow = document.getElementById('btnLaunchConfidenceWindow');
    const btnCopyConfidenceWebUrl = document.getElementById('btnCopyConfidenceWebUrl');
    const txtStageCueMessage = document.getElementById('txtStageCueMessage');
    const btnSendStageCue = document.getElementById('btnSendStageCue');
    const btnClearStageCue = document.getElementById('btnClearStageCue');
    const selConfidenceDisplay = document.getElementById('selConfidenceDisplay');
    const btnRefreshConfidenceDisplays = document.getElementById('btnRefreshConfidenceDisplays');

    async function populateConfidenceDisplays() {
      if (!selConfidenceDisplay) return;
      try {
        let displays = [];
        if (window.electronAPI && window.electronAPI.getDisplays) {
          displays = await window.electronAPI.getDisplays();
        }
        if (!Array.isArray(displays) || displays.length === 0) {
          selConfidenceDisplay.innerHTML = '<option value="">Display 1: Main Display (Default)</option>';
          return;
        }

        const savedDisplayId = localStorage.getItem('pdf_presenter_confidence_display_id');
        selConfidenceDisplay.innerHTML = '';

        displays.forEach((disp, idx) => {
          const opt = document.createElement('option');
          opt.value = disp.id;
          const isPrimary = Boolean(disp.isPrimary || idx === 0);
          const role = isPrimary ? '(Primary Monitor)' : (idx === 1 ? '(Secondary / Audience Display)' : '(Stage / Floor Monitor)');
          opt.textContent = `Display ${idx + 1}: ${disp.bounds.width}×${disp.bounds.height} ${role}`;
          selConfidenceDisplay.appendChild(opt);
        });

        if (savedDisplayId && displays.some(d => String(d.id) === String(savedDisplayId))) {
          selConfidenceDisplay.value = savedDisplayId;
        } else if (displays.length > 2) {
          selConfidenceDisplay.value = displays[2].id;
        } else if (displays.length > 1) {
          selConfidenceDisplay.value = displays[1].id;
        } else {
          selConfidenceDisplay.value = displays[0].id;
        }
      } catch (err) {
        console.warn('[Confidence Displays Scan Error]', err);
      }
    }

    if (selConfidenceDisplay) {
      selConfidenceDisplay.addEventListener('change', () => {
        try { localStorage.setItem('pdf_presenter_confidence_display_id', selConfidenceDisplay.value); } catch (e) {}
      });
    }

    if (btnRefreshConfidenceDisplays) {
      btnRefreshConfidenceDisplays.addEventListener('click', async () => {
        const origText = btnRefreshConfidenceDisplays.textContent;
        btnRefreshConfidenceDisplays.textContent = '✓ Scanned';
        await populateConfidenceDisplays();
        setTimeout(() => { btnRefreshConfidenceDisplays.textContent = origText; }, 1200);
      });
    }

    if (btnConfidenceMonitor) {
      btnConfidenceMonitor.addEventListener('click', () => {
        populateConfidenceDisplays();
        if (confidenceModal) confidenceModal.classList.add('open');
      });
    }

    // Populate initial displays list
    populateConfidenceDisplays();

    if (btnLaunchConfidenceWindow) {
      btnLaunchConfidenceWindow.addEventListener('click', async () => {
        const displayId = selConfidenceDisplay ? selConfidenceDisplay.value : null;
        if (window.electronAPI && window.electronAPI.launchConfidenceWindow) {
          await window.electronAPI.launchConfidenceWindow({ displayId, fullscreen: true });
        } else {
          window.open('confidence.html', '_blank', 'width=1280,height=720');
        }
      });
    }

    if (btnCopyConfidenceWebUrl) {
      btnCopyConfidenceWebUrl.addEventListener('click', async () => {
        let confUrl = 'http://localhost:3000/views/confidence.html';
        if (window.electronAPI && window.electronAPI.getCompanionInfo) {
          const info = await window.electronAPI.getCompanionInfo();
          if (info && info.confidenceUrl) {
            confUrl = info.confidenceUrl;
          } else if (info && info.companionApiUrl) {
            try {
              const parsed = new URL(info.companionApiUrl);
              confUrl = `${parsed.protocol}//${parsed.host}/views/confidence.html`;
            } catch (e) {}
          }
        }
        try {
          await navigator.clipboard.writeText(confUrl);
          const orig = btnCopyConfidenceWebUrl.textContent;
          btnCopyConfidenceWebUrl.textContent = '✓ Copied URL!';
          setTimeout(() => { btnCopyConfidenceWebUrl.textContent = orig; }, 1500);
        } catch (e) {
          alert('Stage Confidence Monitor URL: ' + confUrl);
        }
      });
    }

    function dispatchStageCue(message, duration = 10000) {
      emitSync({
        type: 'STAGE_CUE',
        message: message,
        duration: duration
      });
    }

    if (btnSendStageCue && txtStageCueMessage) {
      btnSendStageCue.addEventListener('click', () => {
        const msg = txtStageCueMessage.value.trim();
        if (msg) {
          dispatchStageCue(msg, 10000);
          btnSendStageCue.textContent = '✓ Sent';
          setTimeout(() => { btnSendStageCue.textContent = '📢 Send Cue'; }, 1200);
        }
      });
      txtStageCueMessage.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          btnSendStageCue.click();
        }
      });
    }

    if (btnClearStageCue) {
      btnClearStageCue.addEventListener('click', () => {
        if (txtStageCueMessage) txtStageCueMessage.value = '';
        dispatchStageCue(null, 0);
      });
    }

    document.querySelectorAll('.cue-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const cue = btn.dataset.cue;
        if (cue) {
          if (txtStageCueMessage) txtStageCueMessage.value = cue;
          dispatchStageCue(cue, 10000);
        }
      });
    });

    // Spotlight Button & Mouse Viewport Tracker
    const btnSpotlight = document.getElementById('btnSpotlight');
    if (btnSpotlight) {
      btnSpotlight.addEventListener('click', toggleSpotlightMode);
    }

    const activeSlideViewport = document.getElementById('activeSlideViewport');
    if (activeSlideViewport) {
      activeSlideViewport.addEventListener('mousemove', (e) => {
        if (!spotlightEngine || !spotlightEngine.state.enabled || !activeSlideCanvas) return;
        const rect = activeSlideCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const xPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const yPct = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
          spotlightEngine.setPosition(xPct, yPct, true);
          renderPresenterSpotlight();
        }
      });
    }

    // NDI 5/6 & IP Video Streaming Modal & Controls
    const btnNdiBroadcast = document.getElementById('btnNdiBroadcast');
    const ndiModal = document.getElementById('ndiModal');
    const chkNdiToggle = document.getElementById('chkNdiToggle');
    const ndiBroadcastStatusBadge = document.getElementById('ndiBroadcastStatusBadge');
    const selNdiResolution = document.getElementById('selNdiResolution');
    const selNdiFps = document.getElementById('selNdiFps');

    if (btnNdiBroadcast) {
      btnNdiBroadcast.addEventListener('click', () => {
        if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro()) {
          window.UpgradeModal.open('ndi');
          return;
        }
        if (ndiModal) ndiModal.classList.add('open');
      });
    }

    if (chkNdiToggle && ndiEngine) {
      chkNdiToggle.addEventListener('change', async () => {
        if (chkNdiToggle.checked) {
          const res = await ndiEngine.startBroadcast();
          if (res && res.error === 'PRO_REQUIRED') {
            chkNdiToggle.checked = false;
            if (window.UpgradeModal) window.UpgradeModal.open('ndi');
            return;
          }
          if (ndiBroadcastStatusBadge) {
            ndiBroadcastStatusBadge.textContent = '● BROADCASTING LIVE';
            ndiBroadcastStatusBadge.className = 'broadcast-badge live';
          }
          broadcastCurrentFrameToNdi();
        } else {
          await ndiEngine.stopBroadcast();
          if (ndiBroadcastStatusBadge) {
            ndiBroadcastStatusBadge.textContent = 'STANDBY';
            ndiBroadcastStatusBadge.className = 'broadcast-badge standby';
          }
        }
      });
    }

    if (selNdiResolution && ndiEngine) {
      selNdiResolution.addEventListener('change', () => {
        ndiEngine.setResolution(selNdiResolution.value);
      });
    }

    if (selNdiFps && ndiEngine) {
      selNdiFps.addEventListener('change', () => {
        ndiEngine.setFramerate(Number(selNdiFps.value));
      });
    }

    // OBS Studio & vMix Automation Gateway Modal & Controls
    const btnBroadcastAutomation = document.getElementById('btnBroadcastAutomation');
    const broadcastAutomationModal = document.getElementById('broadcastAutomationModal');
    const chkAutomationToggle = document.getElementById('chkAutomationToggle');
    const selSwitcherType = document.getElementById('selSwitcherType');
    const txtSwitcherHost = document.getElementById('txtSwitcherHost');
    const btnTestAutomationConnect = document.getElementById('btnTestAutomationConnect');

    if (btnBroadcastAutomation) {
      btnBroadcastAutomation.addEventListener('click', () => {
        if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro()) {
          window.UpgradeModal.open('automation');
          return;
        }
        if (broadcastAutomationModal) broadcastAutomationModal.classList.add('open');
      });
    }

    if (chkAutomationToggle && automationEngine) {
      chkAutomationToggle.addEventListener('change', () => {
        if (chkAutomationToggle.checked) {
          const res = automationEngine.enable();
          if (res && res.error === 'PRO_REQUIRED') {
            chkAutomationToggle.checked = false;
            if (window.UpgradeModal) window.UpgradeModal.open('automation');
            return;
          }
        } else {
          automationEngine.disable();
        }
      });
    }

    if (btnTestAutomationConnect && automationEngine) {
      btnTestAutomationConnect.addEventListener('click', async () => {
        btnTestAutomationConnect.textContent = 'Connecting...';
        const type = selSwitcherType ? selSwitcherType.value : 'obs';
        const host = txtSwitcherHost ? txtSwitcherHost.value.trim() : 'localhost:4455';
        const res = await automationEngine.testConnection({ type, host });
        btnTestAutomationConnect.textContent = res.success ? '✓ Connected & Triggered!' : '✕ Connection Failed';
        setTimeout(() => { btnTestAutomationConnect.textContent = '⚡ Test Connection & Trigger'; }, 2000);
      });
    }

    if (btnAddDeck && playlistFileInput) {
      btnAddDeck.addEventListener('click', () => {
        if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro() && playlistEngine && playlistEngine.getPlaylist().length >= 1) {
          window.UpgradeModal.open('playlist');
          return;
        }
        playlistFileInput.click();
      });

      playlistFileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        try {
          for (const file of files) {
            const buffer = await file.arrayBuffer();
            let slideCount = 1;
            try {
              if (typeof pdfjsLib !== 'undefined' && pdfjsLib.getDocument) {
                const tempDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
                slideCount = tempDoc.numPages;
              }
            } catch (pdfErr) {
              console.warn('Could not read slide count for file:', file.name, pdfErr);
            }

            const res = playlistEngine.addDeck({
              title: file.name.replace(/\.[^/.]+$/, ''),
              path: file.path || '',
              pdfBuffer: buffer,
              slideCount: slideCount,
              active: false,
              speaker: `Speaker ${playlistEngine.getPlaylist().length + 1}`
            });

            if (res && res.error === 'PRO_REQUIRED') {
              if (window.UpgradeModal && window.UpgradeModal.open) window.UpgradeModal.open('playlist');
              break;
            }
          }
          renderPlaylistQueue();
        } catch (err) {
          alert('Could not load PDF files into playlist: ' + err.message);
        } finally {
          playlistFileInput.value = '';
        }
      });
    }

    const btnExportMetricsCsv = document.getElementById('btnExportMetricsCsv');
    if (btnExportMetricsCsv) {
      btnExportMetricsCsv.addEventListener('click', () => {
        if (!playlistEngine) return;
        const res = playlistEngine.exportCsvReport();
        if (res && res.csv) {
          downloadBlob(res.csv, `${documentTitle}_Rehearsal_Metrics.csv`, 'text/csv;charset=utf-8;');
        }
      });
    }

    const btnExportMetricsMd = document.getElementById('btnExportMetricsMd');
    if (btnExportMetricsMd) {
      btnExportMetricsMd.addEventListener('click', () => {
        if (!playlistEngine) return;
        const res = playlistEngine.exportMarkdownReport();
        if (res && res.markdown) {
          downloadBlob(res.markdown, `${documentTitle}_Rehearsal_Report.md`, 'text/markdown;charset=utf-8;');
        }
      });
    }

    const btnCopyNotesExport = document.getElementById('btnCopyNotesExport');
    if (btnCopyNotesExport) {
      btnCopyNotesExport.addEventListener('click', async () => {
        const preview = document.getElementById('notesExportPreview');
        if (preview && preview.value) {
          try {
            await navigator.clipboard.writeText(preview.value);
            btnCopyNotesExport.textContent = '✓ Copied!';
            setTimeout(() => { btnCopyNotesExport.textContent = '📋 Copy Notes'; }, 1500);
          } catch (e) {
            preview.select();
            document.execCommand('copy');
          }
        }
      });
    }

    const btnDownloadNotesExport = document.getElementById('btnDownloadNotesExport');
    if (btnDownloadNotesExport) {
      btnDownloadNotesExport.addEventListener('click', () => {
        const preview = document.getElementById('notesExportPreview');
        if (preview && preview.value) {
          downloadBlob(preview.value, `${documentTitle}_Speaker_Notes.md`, 'text/markdown;charset=utf-8;');
        }
      });
    }

    btnShortcuts.addEventListener('click', () => shortcutsModal.classList.add('open'));
    btnEndPresentation.addEventListener('click', handleEndPresentation);

    // About Modal
    const aboutModal = document.getElementById('aboutModal');
    const btnPresenterAbout = document.getElementById('btnPresenterAbout');
    const btnClosePresenterAboutModal = document.getElementById('btnClosePresenterAboutModal');

    if (btnPresenterAbout) {
      btnPresenterAbout.addEventListener('click', () => {
        if (aboutModal) aboutModal.classList.add('open');
      });
    }
    if (btnClosePresenterAboutModal) {
      btnClosePresenterAboutModal.addEventListener('click', () => {
        if (aboutModal) aboutModal.classList.remove('open');
      });
    }

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });

    const btnExportPresetsPresenter = document.getElementById('btnExportCompanionConfigPresenter');
    if (btnExportPresetsPresenter) {
      btnExportPresetsPresenter.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.exportCompanionConfig) {
          const origText = btnExportPresetsPresenter.innerHTML;
          btnExportPresetsPresenter.innerHTML = '<span>⏳</span> Exporting...';
          try {
            const res = await window.electronAPI.exportCompanionConfig();
            if (res && res.success) {
              btnExportPresetsPresenter.innerHTML = '<span>✓</span> Presets Exported!';
              btnExportPresetsPresenter.style.background = '#10b981';
              setTimeout(() => {
                btnExportPresetsPresenter.innerHTML = origText;
                btnExportPresetsPresenter.style.background = '';
              }, 2500);
            } else {
              btnExportPresetsPresenter.innerHTML = origText;
            }
          } catch (e) {
            btnExportPresetsPresenter.innerHTML = origText;
          }
        }
      });
    }

    // Handle External Links (LinkedIn & GitHub)
    document.querySelectorAll('.btn-external-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetUrl = btn.dataset.url;
        if (targetUrl) {
          if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(targetUrl);
          } else {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
        }
      });
    });

    document.querySelectorAll('.api-test-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const endpoint = btn.dataset.endpoint;
        try {
          let testUrl = endpoint;
          if (window.electronAPI && window.electronAPI.getCompanionInfo) {
            const info = await window.electronAPI.getCompanionInfo();
            if (!info || !info.enabled || !info.running) {
              alert('Remote Control API is currently disabled. Enable it in the Launcher settings to test endpoints.');
              return;
            }
            testUrl = `http://localhost:${info.port}${endpoint}`;
          }
          await fetch(testUrl, { method: 'POST' });
          btn.textContent = '✓ Executed';
          setTimeout(() => { btn.textContent = 'Test'; }, 1000);
        } catch (e) {
          alert('API Error: ' + e.message);
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      const openModal = document.querySelector('.modal-backdrop.open');

      // Keyboard focus trap inside open dialogs (WCAG 2.1 AA)
      if (openModal && e.key === 'Tab') {
        const focusable = openModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
            return;
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
            return;
          }
        }
      }

      // Check if user is typing into an input, textarea, select, or contenteditable field
      const isEditing = (
        (e.target && typeof e.target.matches === 'function' && e.target.matches('input, textarea, select, [contenteditable]')) ||
        (document.activeElement && typeof document.activeElement.matches === 'function' && document.activeElement.matches('input, textarea, select, [contenteditable]'))
      );

      // If user is editing or any modal is currently open, suppress presenter shortcuts (allow Escape to close modals)
      if (e.key === 'Escape') {
        // Fall through to the Escape handler below to dismiss popovers or modals
      } else {
        if (isEditing) return;
        if (openModal && e.key !== 'Tab') return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToPage(totalPages);
      } else if (e.key === 'b' || e.key === 'B') {
        setBlankMode('black');
      } else if (e.key === 'w' || e.key === 'W') {
        setBlankMode('white');
      } else if (e.key === 'l' || e.key === 'L') {
        setTool(activeTool === 'laser' ? 'select' : 'laser');
      } else if (e.key === 'p' || e.key === 'P') {
        setTool(activeTool === 'pen' ? 'select' : 'pen');
      } else if (e.key === 'h' || e.key === 'H') {
        setTool(activeTool === 'highlighter' ? 'select' : 'highlighter');
      } else if (e.key === 's' || e.key === 'S') {
        toggleSpotlightMode();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        if (gridModal && gridModal.classList.contains('open')) {
          gridModal.classList.remove('open');
        } else {
          if (window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && !window.UpgradeModal.isPro()) {
            window.UpgradeModal.open('grid');
          } else {
            openSlideGridModal();
          }
        }
      } else if (e.key === '?') {
        shortcutsModal.classList.toggle('open');
      } else if (e.key === 'Escape') {
        if (proToolsMenuPopover && proToolsMenuPopover.style.display !== 'none') {
          proToolsMenuPopover.style.display = 'none';
          if (btnProToolsMenu) {
            btnProToolsMenu.classList.remove('active');
            btnProToolsMenu.setAttribute('aria-expanded', 'false');
          }
          return;
        }
        const openModal = document.querySelector('.modal-backdrop.open');
        if (openModal) {
          openModal.classList.remove('open');
          if (openModal.id === 'upgradeProModal') {
            if (window.UpgradeModal && typeof window.UpgradeModal.close === 'function') {
              window.UpgradeModal.close();
            } else {
              openModal.style.display = 'none';
            }
          }
          return;
        }
        if (activeTool !== 'select') {
          setTool('select');
          return;
        }
        handleEndPresentation();
      } else if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    if (btnTogglePresenterFullscreen) {
      btnTogglePresenterFullscreen.addEventListener('click', toggleFullscreen);
    }

    wireCopyButtons();
  }

  // =========================================================================
  // 12. FULLSCREEN & RESIZABLE LAYOUT
  // =========================================================================
  async function toggleFullscreen() {
    if (window.electronAPI && window.electronAPI.togglePresenterFullscreen) {
      const res = await window.electronAPI.togglePresenterFullscreen();
      if (btnTogglePresenterFullscreen) {
        btnTogglePresenterFullscreen.title = res.isFullScreen ? 'Exit Fullscreen (F11)' : 'Toggle Fullscreen (F11)';
        btnTogglePresenterFullscreen.textContent = res.isFullScreen ? '🗗' : '⛶';
      }
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  }

  function setupResizableLayout() {
    // 1. Restore persistent user layout preferences
    const savedSidebarWidth = localStorage.getItem('presenter_sidebar_width');
    if (savedSidebarWidth && sidebarPanel) {
      sidebarPanel.style.setProperty('--sidebar-width', `${savedSidebarWidth}px`);
      sidebarPanel.style.width = `${savedSidebarWidth}px`;
    }

    const savedNextHeight = localStorage.getItem('presenter_next_slide_height');
    if (savedNextHeight && nextSlideCard) {
      nextSlideCard.style.setProperty('--next-slide-height', `${savedNextHeight}px`);
      nextSlideCard.style.height = `${savedNextHeight}px`;
    }

    // 2. Horizontal Splitter (Slide vs Sidebar)
    if (horizontalSplitter && sidebarPanel) {
      let isDragging = false;
      let startX = 0;
      let startWidth = 0;

      horizontalSplitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startWidth = sidebarPanel.getBoundingClientRect().width;
        document.body.classList.add('resizing-horizontal');
        horizontalSplitter.classList.add('dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const delta = startX - e.clientX;
        const minW = 280;
        const maxW = Math.round(window.innerWidth * 0.7);
        const newWidth = Math.max(minW, Math.min(maxW, Math.round(startWidth + delta)));
        sidebarPanel.style.setProperty('--sidebar-width', `${newWidth}px`);
        sidebarPanel.style.width = `${newWidth}px`;
        resizeDrawingCanvas();
      });

      const stopHorizontalDrag = () => {
        if (isDragging) {
          isDragging = false;
          document.body.classList.remove('resizing-horizontal');
          horizontalSplitter.classList.remove('dragging');
          localStorage.setItem('presenter_sidebar_width', Math.round(sidebarPanel.getBoundingClientRect().width));
          renderCurrentSlide();
          renderNextSlidePreview();
        }
      };

      window.addEventListener('mouseup', stopHorizontalDrag);

      // Double-click resets to default 420px
      horizontalSplitter.addEventListener('dblclick', () => {
        sidebarPanel.style.setProperty('--sidebar-width', '420px');
        sidebarPanel.style.width = '420px';
        localStorage.removeItem('presenter_sidebar_width');
        renderCurrentSlide();
        renderNextSlidePreview();
      });
    }

    // 3. Vertical Splitter (Next Slide vs Speaker Notes)
    if (verticalSplitter && nextSlideCard) {
      let isDragging = false;
      let startY = 0;
      let startHeight = 0;

      verticalSplitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startHeight = nextSlideCard.getBoundingClientRect().height;
        document.body.classList.add('resizing-vertical');
        verticalSplitter.classList.add('dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const delta = e.clientY - startY;
        const minH = 120;
        const maxH = Math.round(window.innerHeight * 0.65);
        const newHeight = Math.max(minH, Math.min(maxH, Math.round(startHeight + delta)));
        nextSlideCard.style.setProperty('--next-slide-height', `${newHeight}px`);
        nextSlideCard.style.height = `${newHeight}px`;
      });

      const stopVerticalDrag = () => {
        if (isDragging) {
          isDragging = false;
          document.body.classList.remove('resizing-vertical');
          verticalSplitter.classList.remove('dragging');
          localStorage.setItem('presenter_next_slide_height', Math.round(nextSlideCard.getBoundingClientRect().height));
          renderNextSlidePreview();
        }
      };

      window.addEventListener('mouseup', stopVerticalDrag);

      // Double-click resets to default 240px
      verticalSplitter.addEventListener('dblclick', () => {
        nextSlideCard.style.setProperty('--next-slide-height', '240px');
        nextSlideCard.style.height = '240px';
        localStorage.removeItem('presenter_next_slide_height');
        renderNextSlidePreview();
      });
    }
  }

  // =========================================================================
  // 13. CLIPBOARD COPY HELPER
  // =========================================================================
  function wireCopyButtons() {
    document.querySelectorAll('.btn-copy').forEach(btn => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = 'true';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const textToCopy = btn.dataset.clipboard || (btn.previousElementSibling ? btn.previousElementSibling.textContent.trim() : '');
        if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy);
            const origHtml = btn.innerHTML;
            btn.innerHTML = '✓ Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = origHtml;
              btn.classList.remove('copied');
            }, 1800);
          } catch (err) {
            console.warn('Clipboard write failed:', err);
          }
        }
      });
    });
  }

  // =========================================================================
  // 14. PRO FEATURES: PLAYLIST, REHEARSAL METRICS & NOTES EXPORT
  // =========================================================================
  function openPlaylistModal() {
    if (playlistModal) {
      renderPlaylistQueue();
      playlistModal.classList.add('open');
    }
  }

  function renderPlaylistQueue() {
    if (!playlistQueueList || !playlistEngine) return;
    playlistQueueList.innerHTML = '';
    const playlist = playlistEngine.getPlaylist();

    if (playlist.length === 0) {
      playlistQueueList.innerHTML = `
        <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 13px;">
          No presentations queued. Click "+ Add PDF Deck" to queue additional speaker decks.
        </div>
      `;
      return;
    }

    playlist.forEach((deck, idx) => {
      const card = document.createElement('div');
      card.className = `playlist-item-card ${deck.active ? 'active' : ''}`;

      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
          <span style="font-size: 20px;">${deck.active ? '▶️' : '📄'}</span>
          <div style="min-width: 0; flex: 1;">
            <div style="font-weight: 700; font-size: 13.5px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(deck.title)}
            </div>
            <div style="display: flex; gap: 8px; align-items: center; margin-top: 3px;">
              <span class="playlist-speaker-pill">${escapeHtml(deck.speaker || `Speaker ${idx + 1}`)}</span>
              <span style="font-size: 11.5px; color: #94a3b8;">${deck.slideCount} slides</span>
              ${deck.active ? '<span style="font-size: 11px; color: #38bdf8; font-weight: 700;">● Active on Screen</span>' : ''}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          ${!deck.active ? `<button type="button" class="btn btn-primary btn-switch-deck" data-id="${deck.id}" style="padding: 4px 10px; font-size: 12px;">Switch Deck</button>` : ''}
          ${playlist.length > 1 ? `<button type="button" class="btn btn-icon btn-remove-deck" data-id="${deck.id}" title="Remove Deck" style="padding: 4px 8px; font-size: 12px; color: #ef4444;">✕</button>` : ''}
        </div>
      `;

      playlistQueueList.appendChild(card);
    });

    playlistQueueList.querySelectorAll('.btn-switch-deck').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await playlistEngine.switchDeck(id);
      });
    });

    playlistQueueList.querySelectorAll('.btn-remove-deck').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        playlistEngine.removeDeck(id);
        renderPlaylistQueue();
      });
    });
  }

  function openMetricsModal() {
    if (!window.UpgradeModal || !window.UpgradeModal.isPro || !window.UpgradeModal.isPro()) {
      if (window.UpgradeModal && window.UpgradeModal.open) window.UpgradeModal.open('metrics');
      return;
    }
    if (!playlistEngine || !metricsModal) return;

    const summary = playlistEngine.getMetricsSummary();
    const totalEl = document.getElementById('metricsTotalTime');
    const avgEl = document.getElementById('metricsAvgTime');
    const longestEl = document.getElementById('metricsLongestSlide');
    const chartList = document.getElementById('metricsChartList');

    if (totalEl) totalEl.textContent = summary.formattedTotalDuration || '00:00';
    if (avgEl) avgEl.textContent = `${summary.formattedAverageTime || '00:00'}`;
    if (longestEl) {
      longestEl.textContent = summary.longestSlide 
        ? `Slide ${summary.longestSlide.slide} (${summary.longestSlide.formattedTime})`
        : '—';
    }

    if (chartList) {
      chartList.innerHTML = '';
      if (!summary.slides || summary.slides.length === 0) {
        chartList.innerHTML = '<div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 12px;">No rehearsal transitions recorded yet.</div>';
      } else {
        summary.slides.forEach(s => {
          const row = document.createElement('div');
          row.className = 'metrics-chart-row';
          const isLong = s.pace === 'slow';
          row.innerHTML = `
            <div style="font-weight: 600; color: #cbd5e1;">Slide ${s.slide}</div>
            <div class="metrics-bar-track">
              <div class="metrics-bar-fill ${isLong ? 'bar-long' : ''}" style="width: ${Math.max(4, s.percentage)}%;"></div>
            </div>
            <div style="text-align: right; font-family: var(--font-mono); color: ${isLong ? '#f59e0b' : '#38bdf8'}; font-weight: 700;">
              ${s.formattedTime}
            </div>
          `;
          chartList.appendChild(row);
        });
      }
    }

    metricsModal.classList.add('open');
  }

  function openNotesExportModal() {
    if (!window.UpgradeModal || !window.UpgradeModal.isPro || !window.UpgradeModal.isPro()) {
      if (window.UpgradeModal && window.UpgradeModal.open) window.UpgradeModal.open('notes');
      return;
    }
    if (!playlistEngine || !notesExportModal) return;

    const res = playlistEngine.exportSpeakerNotesMarkdown({
      documentTitle: documentTitle,
      slideCount: totalPages
    });

    const preview = document.getElementById('notesExportPreview');
    if (preview) {
      preview.value = res.markdown || res.text || '';
    }

    notesExportModal.classList.add('open');
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  await init();
});
