// js/audience.js - Second Screen / Audience Display Controller

document.addEventListener('DOMContentLoaded', async () => {
  const engine = new PDFDocumentEngine();
  const syncBus = new PresentationSyncBus('audience');

  let currentPage = 1;
  let totalPages = 1;
  let currentStroke = [];
  let currentStrokeMeta = null;
  let allStrokes = [];

  // Transition Configuration & Locks (1.0s default for cinematic, buttery smooth dissolve)
  let transitionDuration = 1.0;
  let transitionStyle = 'crossfade';
  let isFirstRender = true;
  let isRendering = false;
  let isTransitioning = false;
  let transitionTimer = null;
  let pendingPage = null;

  // DOM Elements
  const audienceStage = document.getElementById('audienceStage');
  const slideCanvasA = document.getElementById('audienceSlideCanvasA');
  const slideCanvasB = document.getElementById('audienceSlideCanvasB');
  const drawCanvas = document.getElementById('audienceDrawCanvas');
  const audienceSpotlightCanvas = document.getElementById('audienceSpotlightCanvas');
  const laserDot = document.getElementById('laserDot');
  const screenCurtain = document.getElementById('screenCurtain');
  const placeholder = document.getElementById('placeholder');
  const audienceWatermark = document.getElementById('audienceWatermark');
  const audienceBanner = document.getElementById('audienceBanner');
  const audienceBannerText = document.getElementById('audienceBannerText');
  let bannerTimeout = null;

  const EngineClass = window.SpotlightEngine || (typeof SpotlightEngine !== 'undefined' ? SpotlightEngine : null);
  const spotlightEngine = EngineClass ? new EngineClass({ syncBus: syncBus }) : null;

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
    if (typeof i18n !== 'undefined') {
      i18n.applyTranslations();
      window.addEventListener('languageChanged', () => {
        i18n.applyTranslations();
      });
    }

    setupSyncListeners();
    setupInactivityHiding();
    window.addEventListener('resize', handleResize);

    // Restore stored watermark overlay if previously enabled
    try {
      if (typeof localStorage !== 'undefined') {
        const rawWatermark = localStorage.getItem('pdf_presenter_watermark_config');
        if (rawWatermark) {
          applyWatermark(JSON.parse(rawWatermark));
        }
      }
    } catch (e) {}

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
      const hasValidData = pdfData && (pdfData.byteLength > 0 || pdfData.length > 0);
      if (hasValidData) {
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
          hideLaser();
          await renderSlide();
          break;
        }

        case 'LASER_MOVED':
          if (data.visible) showLaser(data.x, data.y);
          else hideLaser();
          break;

        case 'PEN_DOWN':
          currentStrokeMeta = {
            color: data.color || '#eab308',
            alpha: data.alpha !== undefined ? data.alpha : 1.0,
            width: data.width || 5,
            tool: data.tool || 'pen',
            rgba: data.rgba || null
          };
          currentStroke = [data.point];
          break;

        case 'PEN_POINT':
          currentStroke.push(data.point);
          drawLiveSegment(data.point, currentStrokeMeta);
          break;

        case 'PEN_UP':
          if (currentStroke.length > 0) {
            allStrokes.push({
              points: [...currentStroke],
              ...(currentStrokeMeta || { color: '#eab308', alpha: 1.0, width: 5 })
            });
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

        case 'SET_LANGUAGE':
          if (typeof i18n !== 'undefined' && data.language) {
            i18n.setLanguage(data.language);
          }
          break;

        case 'SET_WATERMARK':
          applyWatermark(data.config || data);
          break;

        case 'SHOW_BANNER':
          showAudienceBanner(data.message, data.duration);
          break;

        case 'HIDE_BANNER':
          hideAudienceBanner();
          break;

        case 'SPOTLIGHT_TOGGLE':
          if (spotlightEngine) {
            spotlightEngine.toggle(data.enabled);
            renderAudienceSpotlight();
          }
          break;

        case 'SPOTLIGHT_MOVE':
          if (spotlightEngine) {
            spotlightEngine.setPosition(data.x, data.y, false);
            renderAudienceSpotlight();
          }
          break;

        case 'SPOTLIGHT_CONFIG':
          if (spotlightEngine) {
            if (data.radius) spotlightEngine.setRadius(data.radius);
            renderAudienceSpotlight();
          }
          break;

        case 'LOAD_DOCUMENT':
          finishTransitionImmediately();
          isFirstRender = true;
          if (data.isDemo) {
            await loadDemo();
          } else if (data.pdfData || data.pdfBuffer || data.path) {
            await loadDocumentConfig({ title: data.title, filePath: data.path }, null, data.pdfData || data.pdfBuffer || null);
          } else {
            await loadDemo();
          }
          clearDrawings();
          break;
      }
    };

    if (window.electronAPI && window.electronAPI.onSync) {
      window.electronAPI.onSync(handleSync);
    }
    if (typeof syncBus !== 'undefined') {
      syncBus.on('PAGE_CHANGED', handleSync);
      syncBus.on('GOTO_PAGE', handleSync);
      syncBus.on('LASER_MOVED', handleSync);
      syncBus.on('PEN_DOWN', handleSync);
      syncBus.on('PEN_POINT', handleSync);
      syncBus.on('PEN_UP', handleSync);
      syncBus.on('CLEAR_PEN', handleSync);
      syncBus.on('SET_BLANK', handleSync);
      syncBus.on('SPOTLIGHT_TOGGLE', handleSync);
      syncBus.on('SPOTLIGHT_MOVE', handleSync);
      syncBus.on('SPOTLIGHT_CONFIG', handleSync);
      syncBus.on('SET_LANGUAGE', handleSync);
      syncBus.on('SET_WATERMARK', handleSync);
      syncBus.on('SHOW_BANNER', handleSync);
      syncBus.on('HIDE_BANNER', handleSync);
      syncBus.on('LOAD_DOCUMENT', handleSync);
    }
  }

  function applyWatermark(config) {
    if (!audienceWatermark) return;
    if (!config || !config.enabled) {
      audienceWatermark.style.display = 'none';
      return;
    }

    const pos = config.position || 'bottom-right';
    audienceWatermark.className = `audience-watermark pos-${pos}`;
    audienceWatermark.style.opacity = (config.opacity !== undefined) ? String(config.opacity) : '0.8';
    audienceWatermark.style.transform = `scale(${(config.scale !== undefined) ? config.scale : '1.0'})`;

    if (config.imageUrl) {
      audienceWatermark.innerHTML = `<img src="${config.imageUrl}" alt="Brand Watermark">`;
    } else if (config.text) {
      audienceWatermark.innerHTML = `<div class="audience-watermark-text">${config.text}</div>`;
    } else {
      audienceWatermark.innerHTML = '';
    }

    audienceWatermark.style.display = 'flex';
  }

  function showAudienceBanner(message, duration) {
    if (!audienceBanner) return;
    if (bannerTimeout) {
      clearTimeout(bannerTimeout);
      bannerTimeout = null;
    }

    if (audienceBannerText) {
      audienceBannerText.textContent = message || '';
    }

    audienceBanner.style.display = 'flex';
    void audienceBanner.offsetHeight; // Force reflow to trigger slide-up CSS transition
    audienceBanner.classList.add('show');

    const dur = Number(duration || 0);
    if (dur > 0) {
      const timeoutMs = dur <= 1000 ? dur * 1000 : dur;
      bannerTimeout = setTimeout(() => {
        hideAudienceBanner();
      }, timeoutMs);
    }
  }

  function hideAudienceBanner() {
    if (!audienceBanner) return;
    if (bannerTimeout) {
      clearTimeout(bannerTimeout);
      bannerTimeout = null;
    }

    audienceBanner.classList.remove('show');
    setTimeout(() => {
      if (!audienceBanner.classList.contains('show')) {
        audienceBanner.style.display = 'none';
      }
    }, 400);
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

    // The incoming slide was being dissolved in on backCanvas (z-index 2).
    // Promote it to activeCanvas immediately so rapid scrubbing advances cleanly
    // without flickering back to the outgoing slide.
    backCanvas.style.transition = 'none';
    backCanvas.style.opacity = '1';
    backCanvas.style.zIndex = '1';
    backCanvas.className = 'slide-canvas active';

    activeCanvas.style.transition = 'none';
    activeCanvas.style.opacity = '0';
    activeCanvas.style.zIndex = '1';
    activeCanvas.className = 'slide-canvas';

    const prevActive = activeCanvas;
    activeCanvas = backCanvas;
    backCanvas = prevActive;
  }

  async function renderSlide() {
    if (isRendering) {
      pendingPage = currentPage;
      return;
    }
    isRendering = true;

    try {
      // If a transition was mid-flight, settle it immediately so backCanvas is 100% hidden
      if (isTransitioning) {
        finishTransitionImmediately();
      }

      const targetW = window.innerWidth || 1920;
      const targetH = window.innerHeight || 1080;

      // 1. First render
      if (isFirstRender) {
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

      // 2. Instant cut (0s duration or 'none' style) - render offscreen to backCanvas first, then swap atomically
      if (transitionDuration === 0 || transitionStyle === 'none') {
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

        // Atomic swap without intermediate blank frame
        backCanvas.style.opacity = '1';
        backCanvas.className = 'slide-canvas active';
        activeCanvas.style.opacity = '0';
        activeCanvas.className = 'slide-canvas';

        const outgoing = activeCanvas;
        activeCanvas = backCanvas;
        backCanvas = outgoing;

        resizeDrawCanvas();
        clearDrawings();
        if (placeholder) placeholder.style.display = 'none';
        return;
      }

      // 3. Render new slide off-screen into backCanvas while hidden (opacity 0)
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

      // Lock both canvases to matching dimensions before dissolve to eliminate 1px size drift line
      if (backCanvas.style.width && activeCanvas.style.width !== backCanvas.style.width) {
        activeCanvas.style.width = backCanvas.style.width;
      }
      if (backCanvas.style.height && activeCanvas.style.height !== backCanvas.style.height) {
        activeCanvas.style.height = backCanvas.style.height;
      }

      // 4. Solid Underlay Dissolve or Slide Animation:
      // The outgoing slide stays solid underneath (opacity 1, zIndex 1).
      // The incoming slide is placed ON TOP (zIndex 2) and smoothly fades from 0 to 1.
      // This prevents ANY black dip, background gap, or transparency hole.
      isTransitioning = true;
      activeCanvas.style.transition = 'none';
      activeCanvas.style.zIndex = '1';
      activeCanvas.style.opacity = '1';

      const incoming = backCanvas;
      const outgoing = activeCanvas;

      if (transitionStyle === 'slide') {
        outgoing.className = 'slide-canvas outgoing';
        incoming.style.zIndex = '2';
        incoming.className = 'slide-canvas incoming active';

        // Swap buffer references
        activeCanvas = incoming;
        backCanvas = outgoing;

        transitionTimer = setTimeout(() => {
          isTransitioning = false;
          outgoing.style.transition = 'none';
          outgoing.style.opacity = '0';
          outgoing.style.zIndex = '1';
          outgoing.className = 'slide-canvas';

          incoming.style.transition = 'none';
          incoming.style.opacity = '1';
          incoming.style.zIndex = '1';
          incoming.className = 'slide-canvas active';

          transitionTimer = null;
          resizeDrawCanvas();
          clearDrawings();
        }, (transitionDuration * 1000) + 50);
      } else {
        outgoing.className = 'slide-canvas active';
        incoming.style.zIndex = '2';

        // Ensure browser compositor has registered incoming canvas at opacity 0 before transition kicks in
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        incoming.style.transition = `opacity ${transitionDuration}s ease-in-out`;
        incoming.style.opacity = '1';
        incoming.className = 'slide-canvas dissolve-in';

        // 5. When transition completes, swap references and cleanly silence the background canvas
        transitionTimer = setTimeout(() => {
          isTransitioning = false;
          outgoing.style.transition = 'none';
          outgoing.style.opacity = '0';
          outgoing.style.zIndex = '1';
          outgoing.className = 'slide-canvas';

          incoming.style.transition = 'none';
          incoming.style.opacity = '1';
          incoming.style.zIndex = '1';
          incoming.className = 'slide-canvas active';

          // Atomically swap active reference only when incoming is 100% opaque
          activeCanvas = incoming;
          backCanvas = outgoing;

          transitionTimer = null;
          resizeDrawCanvas();
          clearDrawings();
        }, (transitionDuration * 1000) + 50);
      }

      if (placeholder) placeholder.style.display = 'none';
    } finally {
      isRendering = false;
      if (pendingPage !== null && pendingPage !== currentPage) {
        const next = pendingPage;
        pendingPage = null;
        currentPage = next;
        renderSlide();
      } else {
        pendingPage = null;
      }
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
    const w = Math.round(rect.width) || window.innerWidth;
    const h = Math.round(rect.height) || window.innerHeight;
    const left = Math.round(rect.left);
    const top = Math.round(rect.top);

    drawCanvas.width = w;
    drawCanvas.height = h;
    drawCanvas.style.width = `${w}px`;
    drawCanvas.style.height = `${h}px`;
    drawCanvas.style.left = `${left}px`;
    drawCanvas.style.top = `${top}px`;

    if (audienceSpotlightCanvas) {
      audienceSpotlightCanvas.width = w;
      audienceSpotlightCanvas.height = h;
      audienceSpotlightCanvas.style.width = `${w}px`;
      audienceSpotlightCanvas.style.height = `${h}px`;
      audienceSpotlightCanvas.style.left = `${left}px`;
      audienceSpotlightCanvas.style.top = `${top}px`;
      renderAudienceSpotlight();
    }

    redrawAllStrokes();
  }

  function renderAudienceSpotlight() {
    if (!audienceSpotlightCanvas || !spotlightEngine) return;
    const ctx = audienceSpotlightCanvas.getContext('2d');
    ctx.clearRect(0, 0, audienceSpotlightCanvas.width, audienceSpotlightCanvas.height);
    if (spotlightEngine.state && spotlightEngine.state.enabled) {
      spotlightEngine.render(ctx, audienceSpotlightCanvas.width, audienceSpotlightCanvas.height);
    }
  }

  function hexToRgba(hex, alpha = 1.0) {
    if (!hex) return `rgba(234, 179, 8, ${alpha})`;
    let clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    if (clean.length !== 6) return `rgba(234, 179, 8, ${alpha})`;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function drawLiveSegment(newPoint, meta) {
    if (currentStroke.length < 2) return;
    const p1 = currentStroke[currentStroke.length - 2];
    const p2 = newPoint;

    const ctx = drawCanvas.getContext('2d');
    const color = (meta && meta.color) || '#eab308';
    const alpha = (meta && meta.alpha !== undefined) ? meta.alpha : 1.0;
    const width = (meta && meta.width) || 5;

    ctx.save();
    ctx.strokeStyle = (meta && meta.rgba) ? meta.rgba : hexToRgba(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(p1.x * drawCanvas.width, p1.y * drawCanvas.height);
    ctx.lineTo(p2.x * drawCanvas.width, p2.y * drawCanvas.height);
    ctx.stroke();
    ctx.restore();
  }

  function redrawAllStrokes() {
    const ctx = drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

    allStrokes.forEach(stroke => {
      const pts = Array.isArray(stroke) ? stroke : stroke.points;
      if (!pts || pts.length < 2) return;
      const color = stroke.color || '#eab308';
      const alpha = stroke.alpha !== undefined ? stroke.alpha : 1.0;
      const width = stroke.width || 5;

      ctx.save();
      ctx.strokeStyle = stroke.rgba || hexToRgba(color, alpha);
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(pts[0].x * drawCanvas.width, pts[0].y * drawCanvas.height);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * drawCanvas.width, pts[i].y * drawCanvas.height);
      }
      ctx.stroke();
      ctx.restore();
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

  // Keyboard navigation & numeric jump if audience window has keyboard focus
  let audienceJumpBuffer = '';
  let audienceJumpTimer = null;

  function clearAudienceJumpBuffer() {
    audienceJumpBuffer = '';
    if (audienceJumpTimer) {
      clearTimeout(audienceJumpTimer);
      audienceJumpTimer = null;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;

    // Direct numeric jump: 0-9 then Enter
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      if (audienceJumpBuffer === '' && e.key === '0') return;
      if (audienceJumpBuffer.length < 4) {
        audienceJumpBuffer += e.key;
        if (audienceJumpTimer) clearTimeout(audienceJumpTimer);
        audienceJumpTimer = setTimeout(clearAudienceJumpBuffer, 3500);
      }
      return;
    }

    if (e.key === 'Enter') {
      if (audienceJumpBuffer.length > 0) {
        e.preventDefault();
        const targetPage = parseInt(audienceJumpBuffer, 10);
        clearAudienceJumpBuffer();
        if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
          syncBus.send({ type: 'GOTO_PAGE', page: targetPage });
        } else if (targetPage > totalPages) {
          syncBus.send({ type: 'GOTO_PAGE', page: totalPages });
        }
        return;
      }
      e.preventDefault();
      if (currentPage < totalPages) {
        syncBus.send({ type: 'GOTO_PAGE', page: currentPage + 1 });
      }
      return;
    }

    if (e.key === 'Backspace' && audienceJumpBuffer.length > 0) {
      e.preventDefault();
      audienceJumpBuffer = audienceJumpBuffer.slice(0, -1);
      if (audienceJumpTimer) clearTimeout(audienceJumpTimer);
      if (audienceJumpBuffer.length > 0) {
        audienceJumpTimer = setTimeout(clearAudienceJumpBuffer, 3500);
      }
      return;
    }

    if (audienceJumpBuffer.length > 0 && e.key !== 'Shift') {
      clearAudienceJumpBuffer();
    }

    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      if (currentPage < totalPages) {
        syncBus.send({ type: 'GOTO_PAGE', page: currentPage + 1 });
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
      e.preventDefault();
      if (currentPage > 1) {
        syncBus.send({ type: 'GOTO_PAGE', page: currentPage - 1 });
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      syncBus.send({ type: 'GOTO_PAGE', page: 1 });
    } else if (e.key === 'End') {
      e.preventDefault();
      syncBus.send({ type: 'GOTO_PAGE', page: totalPages });
    } else if (e.key === 'b' || e.key === 'B') {
      syncBus.send({ type: 'SET_BLANK', mode: screenCurtain && screenCurtain.classList.contains('active') ? 'none' : 'black' });
    } else if (e.key === 'w' || e.key === 'W') {
      syncBus.send({ type: 'SET_BLANK', mode: screenCurtain && screenCurtain.classList.contains('active') ? 'none' : 'white' });
    } else if (e.key === 'Escape') {
      clearAudienceJumpBuffer();
    }
  });

  await init();
});
