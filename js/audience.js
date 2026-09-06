// js/audience.js - Second Screen / Audience Display Controller

document.addEventListener('DOMContentLoaded', async () => {
  const engine = new PDFDocumentEngine();
  const syncBus = new PresentationSyncBus('audience');

  let currentPage = 1;
  let totalPages = 1;
  let currentStroke = [];
  let allStrokes = [];

  // Transition Configuration & Locks (1.0s default for cinematic, buttery smooth dissolve)
  let transitionDuration = 1.0;
  let transitionStyle = 'crossfade';
  let isFirstRender = true;
  let isRendering = false;
  let isTransitioning = false;
  let transitionTimer = null;

  // DOM Elements
  const audienceStage = document.getElementById('audienceStage');
  const slideCanvasA = document.getElementById('audienceSlideCanvasA');
  const slideCanvasB = document.getElementById('audienceSlideCanvasB');
  const drawCanvas = document.getElementById('audienceDrawCanvas');
  const laserDot = document.getElementById('laserDot');
  const screenCurtain = document.getElementById('screenCurtain');
  const placeholder = document.getElementById('placeholder');

  let activeCanvas = slideCanvasA;
  let backCanvas = slideCanvasB;

  // Ensure initial states are clean and distinct
  activeCanvas.style.opacity = '1';
  activeCanvas.style.zIndex = '1';
  backCanvas.style.opacity = '0';
  backCanvas.style.zIndex = '1';

  // =========================================================================
  // 1. INITIALIZATION & SYNC LISTENERS
  // =========================================================================
  async function init() {
    setupSyncListeners();
    setupInactivityHiding();
    window.addEventListener('resize', handleResize);

    if (window.electronAPI && window.electronAPI.getPresentationData) {
      try {
        const data = await window.electronAPI.getPresentationData();
        if (data && data.config) {
          await loadDocumentConfig(data.config, data.streamUrl, data.pdfData);
          return;
        }
      } catch (err) {
        console.warn('Error fetching audience presentation data:', err);
      }
    }

    await loadDemo();
  }

  function applyTransitionConfig(config) {
    if (typeof config.transitionDuration === 'number') {
      transitionDuration = config.transitionDuration;
    }
    if (config.transitionStyle) {
      transitionStyle = config.transitionStyle;
    }
    document.documentElement.style.setProperty('--transition-duration', `${transitionDuration}s`);
    if (transitionStyle === 'slide') {
      audienceStage.classList.add('stage-slide');
    } else {
      audienceStage.classList.remove('stage-slide');
    }
  }

  async function loadDocumentConfig(config, streamUrl = null, pdfData = null) {
    applyTransitionConfig(config);

    if (config.isDemo) {
      await loadDemo();
      return;
    }

    try {
      let docInfo;
      if (pdfData) {
        docInfo = await engine.loadPDFData(pdfData, config.title);
      } else if (streamUrl) {
        docInfo = await engine.loadPDFFromUrl(streamUrl, config.title);
      } else {
        const url = 'http://localhost:3000/api/document/current.pdf';
        docInfo = await engine.loadPDFFromUrl(url, config.title);
      }
      totalPages = docInfo.totalPages;
      currentPage = 1;
      await renderSlide();
      if (placeholder) placeholder.style.display = 'none';
    } catch (e) {
      console.error('Error loading audience PDF data', e);
      await loadDemo();
    }
  }

  async function loadDemo() {
    const docInfo = await engine.loadDemo();
    totalPages = docInfo.totalPages;
    currentPage = 1;
    await renderSlide();
    if (placeholder) placeholder.style.display = 'none';
  }

  function setupSyncListeners() {
    const handleSync = async (data) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'PAGE_CHANGED':
        case 'GOTO_PAGE': {
          const targetPage = Number(data.page);
          if (targetPage === currentPage && !isFirstRender) return;
          currentPage = targetPage;
          clearDrawings();
          hideLaser();
          await renderSlide();
          break;
        }

        case 'LASER_MOVED':
          if (data.visible) showLaser(data.x, data.y);
          else hideLaser();
          break;

        case 'PEN_DOWN':
          currentStroke = [data.point];
          break;

        case 'PEN_POINT':
          currentStroke.push(data.point);
          drawLiveSegment(data.point);
          break;

        case 'PEN_UP':
          if (currentStroke.length > 0) {
            allStrokes.push([...currentStroke]);
            currentStroke = [];
          }
          break;

        case 'CLEAR_PEN':
          clearDrawings();
          break;

        case 'SET_BLANK':
          if (data.mode === 'black') screenCurtain.className = 'screen-curtain blackout';
          else if (data.mode === 'white') screenCurtain.className = 'screen-curtain whiteout';
          else screenCurtain.className = 'screen-curtain';
          break;
      }
    };

    if (window.electronAPI && window.electronAPI.onSync) {
      window.electronAPI.onSync(handleSync);
    } else {
      syncBus.on('PAGE_CHANGED', handleSync);
      syncBus.on('GOTO_PAGE', handleSync);
      syncBus.on('LASER_MOVED', handleSync);
      syncBus.on('PEN_DOWN', handleSync);
      syncBus.on('PEN_POINT', handleSync);
      syncBus.on('PEN_UP', handleSync);
      syncBus.on('CLEAR_PEN', handleSync);
      syncBus.on('SET_BLANK', handleSync);
    }
  }

  // =========================================================================
  // 2. TRUE DISSOLVE TRANSITIONS (ELIMINATES ALL WHITE FLASHES)
  // =========================================================================
  function finishTransitionImmediately() {
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    isTransitioning = false;
    activeCanvas.style.transition = 'none';
    backCanvas.style.transition = 'none';
    activeCanvas.style.opacity = '1';
    activeCanvas.style.zIndex = '1';
    backCanvas.style.opacity = '0';
    backCanvas.style.zIndex = '1';
    activeCanvas.className = 'slide-canvas active';
    backCanvas.className = 'slide-canvas';
    void activeCanvas.offsetWidth;
  }

  async function renderSlide() {
    if (isRendering) return;
    isRendering = true;

    try {
      // If a transition was mid-flight, settle it immediately so backCanvas is 100% hidden
      if (isTransitioning) {
        finishTransitionImmediately();
      }

      const targetW = window.innerWidth || 1920;
      const targetH = window.innerHeight || 1080;

      // 1. First render or 0s instant cut
      if (isFirstRender || transitionDuration === 0 || transitionStyle === 'none') {
        await engine.renderPageToCanvas(currentPage, activeCanvas, {
          targetWidth: targetW,
          targetHeight: targetH,
          width: targetW,
          height: targetH,
          scale: 2.0
        });
        activeCanvas.style.transition = 'none';
        activeCanvas.style.opacity = '1';
        activeCanvas.style.zIndex = '1';
        activeCanvas.className = 'slide-canvas active';

        backCanvas.style.transition = 'none';
        backCanvas.style.opacity = '0';
        backCanvas.style.zIndex = '1';
        backCanvas.className = 'slide-canvas';

        isFirstRender = false;
        resizeDrawCanvas();
        if (placeholder) placeholder.style.display = 'none';
        return;
      }

      // 2. Render new slide off-screen into backCanvas while it is strictly hidden (opacity 0)
      backCanvas.style.transition = 'none';
      backCanvas.style.opacity = '0';
      backCanvas.style.zIndex = '1';
      backCanvas.className = 'slide-canvas';

      await engine.renderPageToCanvas(currentPage, backCanvas, {
        targetWidth: targetW,
        targetHeight: targetH,
        width: targetW,
        height: targetH,
        scale: 2.0
      });

      // Force layout flush so browser applies opacity 0 before transition begins
      void backCanvas.offsetWidth;

      // 3. True Keynote/PowerPoint Dissolve:
      // The outgoing slide stays solid underneath (opacity 1, zIndex 1).
      // The incoming slide is placed ON TOP (zIndex 2) and smoothly fades from 0 to 1.
      // This prevents ANY black dip, background gap, or white flash.
      isTransitioning = true;
      backCanvas.style.zIndex = '2';
      activeCanvas.style.zIndex = '1';
      activeCanvas.style.opacity = '1';

      if (transitionStyle === 'slide') {
        activeCanvas.className = 'slide-canvas outgoing';
        backCanvas.className = 'slide-canvas incoming active';
      } else {
        backCanvas.style.transition = `opacity ${transitionDuration}s ease-in-out`;
        backCanvas.style.opacity = '1';
        backCanvas.className = 'slide-canvas active';
        activeCanvas.className = 'slide-canvas';
      }

      // 4. Swap buffer references
      const outgoing = activeCanvas;
      activeCanvas = backCanvas;
      backCanvas = outgoing;

      // 5. When transition completes, cleanly silence the now-hidden background canvas
      transitionTimer = setTimeout(() => {
        isTransitioning = false;
        backCanvas.style.transition = 'none';
        backCanvas.style.opacity = '0';
        backCanvas.style.zIndex = '1';
        activeCanvas.style.zIndex = '1';
        transitionTimer = null;
      }, transitionDuration * 1000);

      resizeDrawCanvas();
      if (placeholder) placeholder.style.display = 'none';
    } finally {
      isRendering = false;
    }
  }

  let resizeTimer = null;
  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      await renderSlide();
      redrawAllStrokes();
    }, 150);
  }

  // =========================================================================
  // 3. LASER & DRAWING OVERLAYS
  // =========================================================================
  function showLaser(xPct, yPct) {
    const rect = activeCanvas.getBoundingClientRect();
    const x = rect.left + xPct * rect.width;
    const y = rect.top + yPct * rect.height;

    laserDot.style.left = `${x}px`;
    laserDot.style.top = `${y}px`;
    laserDot.classList.add('visible');
  }

  function hideLaser() {
    laserDot.classList.remove('visible');
  }

  function resizeDrawCanvas() {
    const rect = activeCanvas.getBoundingClientRect();
    drawCanvas.width = rect.width || window.innerWidth;
    drawCanvas.height = rect.height || window.innerHeight;
    drawCanvas.style.width = `${rect.width}px`;
    drawCanvas.style.height = `${rect.height}px`;
    drawCanvas.style.left = `${rect.left}px`;
    drawCanvas.style.top = `${rect.top}px`;
    redrawAllStrokes();
  }

  function drawLiveSegment(newPoint) {
    if (currentStroke.length < 2) return;
    const p1 = currentStroke[currentStroke.length - 2];
    const p2 = newPoint;

    const ctx = drawCanvas.getContext('2d');
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(p1.x * drawCanvas.width, p1.y * drawCanvas.height);
    ctx.lineTo(p2.x * drawCanvas.width, p2.y * drawCanvas.height);
    ctx.stroke();
  }

  function redrawAllStrokes() {
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    allStrokes.forEach(stroke => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * drawCanvas.width, stroke[0].y * drawCanvas.height);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * drawCanvas.width, stroke[i].y * drawCanvas.height);
      }
      ctx.stroke();
    });
  }

  function clearDrawings() {
    allStrokes = [];
    currentStroke = [];
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }

  function setupInactivityHiding() {
    let hideTimer = null;
    const resetTimer = () => {
      document.body.classList.remove('cursor-hidden');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        document.body.classList.add('cursor-hidden');
      }, 2000);
    };

    window.addEventListener('mousemove', resetTimer);
    resetTimer();
  }

  await init();
});
