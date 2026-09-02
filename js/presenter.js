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
  const btnClearDraw = document.getElementById('btnClearDraw');
  const btnBlackout = document.getElementById('btnBlackout');
  const btnWhiteout = document.getElementById('btnWhiteout');
  const btnTimerToggle = document.getElementById('btnTimerToggle');
  const btnTimerReset = document.getElementById('btnTimerReset');
  const btnCompanion = document.getElementById('btnCompanion');
  const btnGrid = document.getElementById('btnGrid');
  const btnShortcuts = document.getElementById('btnShortcuts');
  const btnEndPresentation = document.getElementById('btnEndPresentation');

  // Modals
  const companionModal = document.getElementById('companionModal');
  const gridModal = document.getElementById('gridModal');
  const shortcutsModal = document.getElementById('shortcutsModal');
  const gridContainer = document.getElementById('gridContainer');

  // =========================================================================
  // 1. INITIALIZATION & DATA INGESTION
  // =========================================================================
  async function init() {
    setupEventListeners();
    setupDrawingLayer();
    startClock();
    setupIpcListeners();

    if (window.electronAPI && window.electronAPI.getPresentationData) {
      try {
        const data = await window.electronAPI.getPresentationData();
        if (data && data.config) {
          await loadConfiguredDocument(data.config, data.streamUrl);
          return;
        }
      } catch (err) {
        console.warn('Error retrieving presentation data:', err);
      }
    }

    await loadPresentationDemo();
  }

  async function loadConfiguredDocument(config, streamUrl = null) {
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
      const url = streamUrl || 'http://localhost:3000/api/document/current.pdf';
      const docInfo = await engine.loadPDFFromUrl(url, config.title);
      documentTitle = docInfo.title;
      totalPages = docInfo.totalPages;
      currentPage = 1;
      updateDocumentHeader();
      await renderAllSlidesUI();
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
    slideCounterEl.textContent = `Slide ${currentPage} of ${totalPages}`;

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
      await engine.renderPageToCanvas(currentPage + 1, nextSlideCanvas, { scale: 1.0 });
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

  // =========================================================================
  // 3. NAVIGATION (NEXT, PREV, GOTO)
  // =========================================================================
  async function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > totalPages || pageNum === currentPage) return;
    currentPage = pageNum;

    // Immediately notify audience window so transition starts simultaneously
    emitSync({ type: 'PAGE_CHANGED', page: currentPage });

    clearLaserPointer();
    clearPenAnnotations();
    updateThumbnailSelection();
    await renderCurrentSlide();
    await renderNextSlidePreview();
    loadSpeakerNotesForCurrentSlide();
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
    } else {
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
  }

  let notesSaveTimeout = null;
  notesTextarea.addEventListener('input', () => {
    notesSaveStatus.textContent = 'Saving notes...';
    clearTimeout(notesSaveTimeout);
    notesSaveTimeout = setTimeout(() => {
      localStorage.setItem(getNotesKey(currentPage), notesTextarea.value);
      notesSaveStatus.textContent = 'All changes auto-saved';
    }, 500);
  });

  // =========================================================================
  // 5. PRESENTATION TOOLS: LASER & DIGITAL PEN
  // =========================================================================
  function setupDrawingLayer() {
    window.addEventListener('resize', resizeDrawingCanvas);
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
  }

  function setTool(toolName) {
    activeTool = toolName;
    btnLaser.classList.toggle('btn-active', activeTool === 'laser');
    btnPen.classList.toggle('btn-active', activeTool === 'pen');
    if (activeTool !== 'laser') clearLaserPointer();
  }

  drawCanvas.addEventListener('mousemove', (e) => {
    const rect = drawCanvas.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;

    if (activeTool === 'laser') {
      renderLaserOnPresenter(e.clientX - rect.left, e.clientY - rect.top);
      emitSync({ type: 'LASER_MOVED', x: xPct, y: yPct, visible: true });
    } else if (activeTool === 'pen' && isDrawing) {
      penStrokes.push({ x: xPct, y: yPct });
      drawPenSegment(xPct, yPct);
      emitSync({ type: 'PEN_POINT', point: { x: xPct, y: yPct } });
    }
  });

  drawCanvas.addEventListener('mouseleave', () => {
    if (activeTool === 'laser') clearLaserPointer();
    if (isDrawing) {
      isDrawing = false;
      emitSync({ type: 'PEN_UP' });
    }
  });

  drawCanvas.addEventListener('mousedown', (e) => {
    if (activeTool === 'pen') {
      isDrawing = true;
      const rect = drawCanvas.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;
      penStrokes = [{ x: xPct, y: yPct }];
      emitSync({ type: 'PEN_DOWN', point: { x: xPct, y: yPct } });
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDrawing) {
      isDrawing = false;
      emitSync({ type: 'PEN_UP' });
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
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
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
  }

  function redrawPenStrokes() {
    if (penStrokes.length < 2) return;
    const ctx = drawCanvas.getContext('2d');
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(penStrokes[0].x * drawCanvas.width, penStrokes[0].y * drawCanvas.height);
    for (let i = 1; i < penStrokes.length; i++) {
      ctx.lineTo(penStrokes[i].x * drawCanvas.width, penStrokes[i].y * drawCanvas.height);
    }
    ctx.stroke();
  }

  function clearPenAnnotations() {
    penStrokes = [];
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
    if (timerRunning) pauseTimer();
    else startTimer();
  }

  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    btnTimerToggle.textContent = '⏸️';
    btnTimerToggle.title = 'Pause Timer';
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerUI();
    }, 1000);
  }

  function pauseTimer() {
    timerRunning = false;
    btnTimerToggle.textContent = '▶️';
    btnTimerToggle.title = 'Start Timer';
    clearInterval(timerInterval);
  }

  function resetTimer() {
    pauseTimer();
    timerSeconds = 0;
    updateTimerUI();
  }

  function updateTimerUI() {
    const m = Math.floor((timerSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (timerSeconds % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
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
  // 9. IPC & COMPANION SYNC LISTENERS
  // =========================================================================
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
      }
    };

    if (window.electronAPI && window.electronAPI.onSync) {
      window.electronAPI.onSync(handleRemoteEvent);
    } else {
      syncBus.on('GOTO_PAGE', handleRemoteEvent);
      syncBus.on('SET_BLANK', handleRemoteEvent);
      syncBus.on('TIMER_CONTROL', handleRemoteEvent);
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
      if (ipContainer && info.localIPs) {
        ipContainer.innerHTML = info.localIPs.map(ip => `<code>http://${ip}:${info.port}/api/</code>`).join(' &nbsp;|&nbsp; ');
      }
    }
  }

  function openSlideGridModal() {
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
    btnClearDraw.addEventListener('click', clearPenAnnotations);
    btnBlackout.addEventListener('click', () => setBlankMode('black'));
    btnWhiteout.addEventListener('click', () => setBlankMode('white'));

    btnTimerToggle.addEventListener('click', toggleTimer);
    btnTimerReset.addEventListener('click', resetTimer);

    btnCompanion.addEventListener('click', openCompanionModal);
    btnGrid.addEventListener('click', openSlideGridModal);
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
          await fetch(endpoint, { method: 'POST' });
          btn.textContent = '✓ Executed';
          setTimeout(() => { btn.textContent = 'Test'; }, 1000);
        } catch (e) {
          alert('API Error: ' + e.message);
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (document.activeElement === notesTextarea) return;

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
      } else if (e.key === 'g' || e.key === 'G') {
        if (gridModal.classList.contains('open')) gridModal.classList.remove('open');
        else openSlideGridModal();
      } else if (e.key === '?') {
        shortcutsModal.classList.toggle('open');
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
        if (activeTool !== 'select') setTool('select');
      }
    });
  }

  await init();
});
