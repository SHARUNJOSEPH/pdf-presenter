/**
 * js/confidence.js
 * Stage Floor Confidence Monitor & Teleprompter Controller
 * Synchronizes slide visuals, high-contrast teleprompter notes, keynote countdown,
 * and live silent stage cues from the Presenter Cockpit.
 */

(function() {
  'use strict';

  // Presentation State
  let engine = window.PDFDocumentEngine ? new window.PDFDocumentEngine() : null;
  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 1;
  let currentNotes = {};
  let notesFontSize = 28; // px

  // Auto-scroll Teleprompter State
  let autoScrollActive = false;
  let autoScrollSpeed = 1; // 0.5x, 1x, 1.5x, 2x, 3x
  let autoScrollAnimationId = null;
  let lastScrollTimestamp = 0;

  // DOM Elements
  const confTimerDisplay = document.getElementById('confTimerDisplay');
  const confClockDisplay = document.getElementById('confClockDisplay');
  const confSlideCounter = document.getElementById('confSlideCounter');
  const confCurrentSlideNum = document.getElementById('confCurrentSlideNum');
  const confNextSlideNum = document.getElementById('confNextSlideNum');
  const confCurrentCanvas = document.getElementById('confCurrentCanvas');
  const confNextCanvas = document.getElementById('confNextCanvas');
  const confNoNextMsg = document.getElementById('confNoNextMsg');
  const confNotesViewport = document.getElementById('confNotesViewport');
  const confNotesText = document.getElementById('confNotesText');
  const btnToggleAutoScroll = document.getElementById('btnToggleAutoScroll');
  const btnScrollSpeed = document.getElementById('btnScrollSpeed');
  const btnFontDecrease = document.getElementById('btnFontDecrease');
  const btnFontIncrease = document.getElementById('btnFontIncrease');
  const confStageCueBanner = document.getElementById('confStageCueBanner');
  const confStageCueText = document.getElementById('confStageCueText');

  // =========================================================================
  // 1. REAL-TIME LOCAL STAGE CLOCK
  // =========================================================================
  function updateStageClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    if (confClockDisplay) {
      confClockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    }
  }
  setInterval(updateStageClock, 1000);
  updateStageClock();

  // =========================================================================
  // 1.5. STAGE ZERO-DISTRACTION AUTO-DIMMING & FULLSCREEN
  // =========================================================================
  let hudDimTimeout = null;
  function resetHudDimmer() {
    if (confTopBar) {
      confTopBar.classList.remove('hud-dimmed');
    }
    if (hudDimTimeout) {
      clearTimeout(hudDimTimeout);
    }
    hudDimTimeout = setTimeout(() => {
      const container = document.querySelector('.confidence-container');
      const drawer = document.getElementById('confTabSizeDrawer');
      const isDrawerOpen = drawer && drawer.style.display !== 'none';
      if (container && container.classList.contains('mode-seamless') && !container.classList.contains('studio-edit-mode') && !isDrawerOpen) {
        if (confTopBar) confTopBar.classList.add('hud-dimmed');
      }
    }, 3500);
  }

  window.addEventListener('mousemove', resetHudDimmer, { passive: true });
  window.addEventListener('mousedown', resetHudDimmer, { passive: true });
  window.addEventListener('keydown', resetHudDimmer, { passive: true });
  resetHudDimmer();

  const btnFullscreenConf = document.getElementById('btnFullscreenConf');
  if (btnFullscreenConf) {
    btnFullscreenConf.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        btnFullscreenConf.textContent = '↙ Exit Fullscreen';
      } else {
        document.exitFullscreen().catch(() => {});
        btnFullscreenConf.textContent = '⤢ Fullscreen';
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        btnFullscreenConf.textContent = '↙ Exit Fullscreen';
      } else {
        btnFullscreenConf.textContent = '⤢ Fullscreen';
      }
    });
  }

  // =========================================================================
  // 2. AUTO-SCROLLING TELEPROMPTER CONTROLLER
  // =========================================================================
  function toggleAutoScroll(forceState) {
    autoScrollActive = typeof forceState === 'boolean' ? forceState : !autoScrollActive;
    if (btnToggleAutoScroll) {
      btnToggleAutoScroll.textContent = autoScrollActive ? '⏸ Pause' : '▶ Auto-Scroll';
      btnToggleAutoScroll.classList.toggle('active', autoScrollActive);
    }
    if (autoScrollActive) {
      startAutoScroll();
    } else {
      stopAutoScroll();
    }
  }

  function startAutoScroll() {
    stopAutoScroll();
    lastScrollTimestamp = performance.now();
    function step(now) {
      if (!autoScrollActive) return;
      const delta = now - lastScrollTimestamp;
      lastScrollTimestamp = now;

      if (confNotesViewport) {
        // Smooth scroll rate: base ~35px/s scaled by autoScrollSpeed
        const px = (autoScrollSpeed * 35 * delta) / 1000;
        confNotesViewport.scrollTop += px;

        // Auto-pause at bottom with slight buffer
        if (confNotesViewport.scrollTop + confNotesViewport.clientHeight >= confNotesViewport.scrollHeight - 4) {
          toggleAutoScroll(false);
          return;
        }
      }
      autoScrollAnimationId = requestAnimationFrame(step);
    }
    autoScrollAnimationId = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    if (autoScrollAnimationId) {
      cancelAnimationFrame(autoScrollAnimationId);
      autoScrollAnimationId = null;
    }
  }

  function cycleScrollSpeed() {
    const speeds = [0.5, 1, 1.5, 2, 3];
    const currentIndex = speeds.indexOf(autoScrollSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    autoScrollSpeed = speeds[nextIndex];
    if (btnScrollSpeed) {
      btnScrollSpeed.textContent = `${autoScrollSpeed}x`;
    }
  }

  if (btnToggleAutoScroll) {
    btnToggleAutoScroll.addEventListener('click', () => toggleAutoScroll());
  }

  if (btnScrollSpeed) {
    btnScrollSpeed.addEventListener('click', cycleScrollSpeed);
  }

  // Font Scaling Controls
  if (btnFontDecrease) {
    btnFontDecrease.addEventListener('click', () => {
      notesFontSize = Math.max(16, notesFontSize - 4);
      if (confNotesText) confNotesText.style.fontSize = `${notesFontSize}px`;
    });
  }
  if (btnFontIncrease) {
    btnFontIncrease.addEventListener('click', () => {
      notesFontSize = Math.min(56, notesFontSize + 4);
      if (confNotesText) confNotesText.style.fontSize = `${notesFontSize}px`;
    });
  }

  // Keyboard navigation & shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      toggleAutoScroll();
    } else if (e.key === '+' || e.key === '=') {
      if (btnFontIncrease) btnFontIncrease.click();
    } else if (e.key === '-' || e.key === '_') {
      if (btnFontDecrease) btnFontDecrease.click();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      if (currentPage < totalPages) navigateSlide(currentPage + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (currentPage > 1) navigateSlide(currentPage - 1);
    }
  });

  function navigateSlide(targetPage) {
    updateSlides(targetPage);
    if (syncBus) {
      syncBus.send({ type: 'GOTO_PAGE', page: targetPage });
    }
    if (window.electronAPI && window.electronAPI.sendSync) {
      window.electronAPI.sendSync({ type: 'GOTO_PAGE', page: targetPage });
    }
  }

  // =========================================================================
  // 2.5. LAYOUT RESIZING & PRESETS CONTROLLER
  // =========================================================================
  const STORAGE_KEY_LAYOUT = 'pdf_presenter_confidence_layout';
  const confTopBar = document.getElementById('confTopBar');
  const confMainContent = document.getElementById('confMainContent');
  const confSlidesSection = document.getElementById('confSlidesSection');
  const confNotesSection = document.getElementById('confNotesSection');
  const confResizerH = document.getElementById('confResizerH');
  const confResizerV = document.getElementById('confResizerV');
  const btnPresetTimer = document.getElementById('btnPresetTimer');
  const btnPresetSlides = document.getElementById('btnPresetSlides');
  const btnPresetNotes = document.getElementById('btnPresetNotes');
  const btnPresetBalanced = document.getElementById('btnPresetBalanced');

  let currentLayout = {
    topHeight: 90,
    slidesWidthPercent: 58,
    timerFontSize: 50,
    activePreset: 'balanced'
  };

  function applyLayout(layout, save = true) {
    if (!layout) return;
    currentLayout = { ...currentLayout, ...layout };

    if (confTopBar) {
      if (typeof currentLayout.topHeight === 'number') {
        confTopBar.style.height = `${currentLayout.topHeight}px`;
      } else {
        confTopBar.style.height = currentLayout.topHeight;
      }
    }

    if (confDashboardGrid && currentLayout.topHeight) {
      const topHStr = typeof currentLayout.topHeight === 'number' ? `${currentLayout.topHeight}px` : currentLayout.topHeight;
      confDashboardGrid.style.setProperty('--conf-row-top-h', topHStr);
    }

    if (confTimerDisplay) {
      confTimerDisplay.style.fontSize = `${currentLayout.timerFontSize}px`;
    }

    if (confSlidesSection) {
      confSlidesSection.style.width = `${currentLayout.slidesWidthPercent}%`;
    }

    if (confDashboardGrid && currentLayout.slidesWidthPercent) {
      const curWin = getDockWindowEl('current');
      const nextWin = getDockWindowEl('next');
      if (curWin && nextWin) {
        const spanCurrent = Math.max(15, Math.min(105, Math.round((currentLayout.slidesWidthPercent / 100) * 120)));
        const spanNext = 120 - spanCurrent;
        curWin.style.gridColumn = `span ${spanCurrent}`;
        nextWin.style.gridColumn = `span ${spanNext}`;
      }
    }

    [btnPresetTimer, btnPresetSlides, btnPresetNotes, btnPresetBalanced].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (currentLayout.activePreset === 'timer' && btnPresetTimer) {
      btnPresetTimer.classList.add('active');
    } else if (currentLayout.activePreset === 'slides' && btnPresetSlides) {
      btnPresetSlides.classList.add('active');
    } else if (currentLayout.activePreset === 'notes' && btnPresetNotes) {
      btnPresetNotes.classList.add('active');
    } else if (btnPresetBalanced) {
      btnPresetBalanced.classList.add('active');
    }

    if (save && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(currentLayout));
      } catch (e) {}
    }
  }

  function loadStoredLayout() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAYOUT);
      if (stored) {
        const parsed = JSON.parse(stored);
        applyLayout(parsed, false);
      }
    } catch (e) {}
  }

  function setPreset(presetName) {
    if (presetName === 'timer') {
      const vh36 = typeof window !== 'undefined' ? Math.max(180, Math.round(window.innerHeight * 0.36)) : 240;
      applyLayout({
        topHeight: vh36,
        timerFontSize: 96,
        slidesWidthPercent: 50,
        activePreset: 'timer'
      });
      if (typeof applyDockPreset === 'function') applyDockPreset('timer');
    } else if (presetName === 'slides') {
      applyLayout({
        topHeight: 85,
        timerFontSize: 46,
        slidesWidthPercent: 68,
        activePreset: 'slides'
      });
      if (typeof applyDockPreset === 'function') applyDockPreset('slides');
    } else if (presetName === 'notes') {
      applyLayout({
        topHeight: 85,
        timerFontSize: 46,
        slidesWidthPercent: 35,
        activePreset: 'notes'
      });
      if (typeof applyDockPreset === 'function') applyDockPreset('notes');
    } else if (presetName === 'cockpit') {
      applyLayout({
        topHeight: 90,
        timerFontSize: 50,
        slidesWidthPercent: 58,
        activePreset: 'cockpit'
      });
      if (typeof applyDockPreset === 'function') applyDockPreset('cockpit');
    } else {
      applyLayout({
        topHeight: 90,
        timerFontSize: 50,
        slidesWidthPercent: 58,
        activePreset: 'balanced'
      });
      if (typeof applyDockPreset === 'function') applyDockPreset('balanced');
    }
  }

  const btnPresetCockpit = document.getElementById('btnPresetCockpit');
  if (btnPresetTimer) btnPresetTimer.addEventListener('click', () => setPreset('timer'));
  if (btnPresetSlides) btnPresetSlides.addEventListener('click', () => setPreset('slides'));
  if (btnPresetNotes) btnPresetNotes.addEventListener('click', () => setPreset('notes'));
  if (btnPresetBalanced) btnPresetBalanced.addEventListener('click', () => setPreset('balanced'));
  if (btnPresetCockpit) btnPresetCockpit.addEventListener('click', () => setPreset('cockpit'));

  if (confResizerH) {
    let isDraggingH = false;
    let startY = 0;
    let startHeight = 90;

    confResizerH.addEventListener('pointerdown', (e) => {
      isDraggingH = true;
      startY = e.clientY;
      startHeight = confTopBar ? confTopBar.getBoundingClientRect().height : 90;
      confResizerH.classList.add('dragging');
      if (typeof confResizerH.setPointerCapture === 'function') {
        try { confResizerH.setPointerCapture(e.pointerId); } catch (err) {}
      }
      document.body.style.cursor = 'row-resize';
    });

    confResizerH.addEventListener('pointermove', (e) => {
      if (!isDraggingH) return;
      const deltaY = e.clientY - startY;
      const minH = 70;
      const maxH = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.65) : 500;
      const newH = Math.max(minH, Math.min(maxH, startHeight + deltaY));
      const newFontSize = Math.round(Math.max(40, Math.min(120, newH * 0.38)));

      applyLayout({
        topHeight: newH,
        timerFontSize: newFontSize,
        activePreset: 'custom'
      });
    });

    const stopDragH = (e) => {
      if (!isDraggingH) return;
      isDraggingH = false;
      confResizerH.classList.remove('dragging');
      if (typeof confResizerH.releasePointerCapture === 'function') {
        try { confResizerH.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      document.body.style.cursor = '';
      applyLayout(currentLayout, true);
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    };

    confResizerH.addEventListener('pointerup', stopDragH);
    confResizerH.addEventListener('pointercancel', stopDragH);
    confResizerH.addEventListener('dblclick', () => {
      if (confDashboardGrid) confDashboardGrid.style.removeProperty('--conf-row-top-h');
      setPreset('balanced');
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    });
  }

  if (confResizerV) {
    let isDraggingV = false;
    let startX = 0;
    let startWidth = 58;

    confResizerV.addEventListener('pointerdown', (e) => {
      isDraggingV = true;
      startX = e.clientX;
      const totalW = confMainContent ? confMainContent.getBoundingClientRect().width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
      const currentSlidesW = confSlidesSection ? confSlidesSection.getBoundingClientRect().width : (totalW * 0.58);
      startWidth = (currentSlidesW / totalW) * 100;
      confResizerV.classList.add('dragging');
      if (typeof confResizerV.setPointerCapture === 'function') {
        try { confResizerV.setPointerCapture(e.pointerId); } catch (err) {}
      }
      document.body.style.cursor = 'col-resize';
    });

    confResizerV.addEventListener('pointermove', (e) => {
      if (!isDraggingV) return;
      const totalW = confMainContent ? confMainContent.getBoundingClientRect().width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
      if (totalW <= 0) return;
      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / totalW) * 100;
      const newPercent = Math.max(20, Math.min(80, Math.round(startWidth + deltaPercent)));

      applyLayout({
        slidesWidthPercent: newPercent,
        activePreset: 'custom'
      });
    });

    const stopDragV = (e) => {
      if (!isDraggingV) return;
      isDraggingV = false;
      confResizerV.classList.remove('dragging');
      if (typeof confResizerV.releasePointerCapture === 'function') {
        try { confResizerV.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      document.body.style.cursor = '';
      applyLayout(currentLayout, true);
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    };

    confResizerV.addEventListener('pointerup', stopDragV);
    confResizerV.addEventListener('pointercancel', stopDragV);
    confResizerV.addEventListener('dblclick', () => {
      const curWin = getDockWindowEl('current');
      const nextWin = getDockWindowEl('next');
      if (curWin) curWin.style.gridColumn = '';
      if (nextWin) nextWin.style.gridColumn = '';
      applyLayout({ slidesWidthPercent: 58, activePreset: 'balanced' });
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    });
  }

  loadStoredLayout();

  // =========================================================================
  // 2.7. STAGE SCALE & DISPLAY ZOOM CONTROLLER (SCALE BIG OR SMALL)
  // =========================================================================
  const STORAGE_KEY_SCALE = 'pdf_presenter_confidence_scale';
  const confScaleToolbar = document.getElementById('confScaleToolbar');
  const btnScaleDown = document.getElementById('btnScaleDown');
  const btnScaleReset = document.getElementById('btnScaleReset');
  const btnScaleUp = document.getElementById('btnScaleUp');

  let currentStageScale = 1.0;

  function applyStageScale(newScale, save = true) {
    currentStageScale = Math.max(0.6, Math.min(2.2, Math.round(newScale * 100) / 100));
    const container = document.getElementById('confContainer') || document.querySelector('.confidence-container');
    if (container) {
      container.style.setProperty('--conf-scale', String(currentStageScale));
    }
    if (btnScaleReset) {
      btnScaleReset.textContent = `${Math.round(currentStageScale * 100)}%`;
      btnScaleReset.title = `Current Scale: ${Math.round(currentStageScale * 100)}% (Click to reset to 100%)`;
      btnScaleReset.classList.toggle('scale-modified', currentStageScale !== 1.0);
    }
    if (typeof adjustGridForActiveWindows === 'function') {
      adjustGridForActiveWindows();
    }
    if (save && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_SCALE, String(currentStageScale));
      } catch (e) {}
    }
  }

  function loadStoredScale() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SCALE);
      if (stored) {
        const val = parseFloat(stored);
        if (!isNaN(val) && val >= 0.5 && val <= 2.5) {
          applyStageScale(val, false);
        }
      }
    } catch (e) {}
  }

  if (btnScaleDown) {
    btnScaleDown.addEventListener('click', () => applyStageScale(currentStageScale - 0.1));
  }
  if (btnScaleUp) {
    btnScaleUp.addEventListener('click', () => applyStageScale(currentStageScale + 0.1));
  }
  if (btnScaleReset) {
    btnScaleReset.addEventListener('click', () => applyStageScale(1.0));
  }

  // Keyboard Shortcuts: Ctrl + Plus, Ctrl + Minus, Ctrl + 0
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyStageScale(currentStageScale + 0.1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyStageScale(currentStageScale - 0.1);
      } else if (e.key === '0') {
        e.preventDefault();
        applyStageScale(1.0);
      }
    }
  });

  loadStoredScale();

  // =========================================================================
  // 2.8. WATCHOUT 7 DOCKABLE DASHBOARD & DRAG-AND-DROP WORKSPACE
  // =========================================================================
  const STORAGE_KEY_DASHBOARD = 'pdf_presenter_confidence_dashboard_layout';
  const confDashboardGrid = document.getElementById('confDashboardGrid');
  const btnLockDashboard = document.getElementById('btnLockDashboard');
  const btnResetLayout = document.getElementById('btnResetLayout');
  const btnWidgetsMenu = document.getElementById('btnWidgetsMenu');
  const confWidgetsDropdown = document.getElementById('confWidgetsDropdown');

  let isDashboardLocked = false;
  let draggedWindow = null;

  const DEFAULT_DASHBOARD_STATE = {
    locked: false,
    order: ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'],
    windows: {
      timer: { visible: true, collapsed: false, span: 'span-1', rowSpan: 'row-span-1', maximized: false },
      clock: { visible: true, collapsed: false, span: 'span-1', rowSpan: 'row-span-1', maximized: false },
      counter: { visible: true, collapsed: false, span: 'span-1', rowSpan: 'row-span-1', maximized: false },
      current: { visible: true, collapsed: false, span: 'span-2', rowSpan: 'row-span-1', maximized: false },
      next: { visible: true, collapsed: false, span: 'span-2', rowSpan: 'row-span-1', maximized: false },
      notes: { visible: true, collapsed: false, span: 'span-2', rowSpan: 'row-span-1', maximized: false },
      cue: { visible: true, collapsed: false, span: 'span-full', rowSpan: 'row-span-1', maximized: false }
    }
  };

  let dashboardState = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_STATE));

  function getDockWindowEl(windowId) {
    if (!windowId) return null;
    const capitalized = windowId.charAt(0).toUpperCase() + windowId.slice(1);
    return document.getElementById(`dockWindow${capitalized}`) || document.querySelector(`.conf-dock-window[data-window-id="${windowId}"]`);
  }

  function getCheckboxEl(windowId) {
    if (!windowId) return null;
    const capitalized = windowId.charAt(0).toUpperCase() + windowId.slice(1);
    return document.getElementById(`chkWin${capitalized}`);
  }

  function setWindowVisibility(windowId, isVisible) {
    const win = getDockWindowEl(windowId);
    if (win) {
      win.style.display = isVisible ? '' : 'none';
    }
    const chk = getCheckboxEl(windowId);
    if (chk) {
      chk.checked = Boolean(isVisible);
    }
    const item = document.querySelector(`.widget-toggle-item[data-window-id="${windowId}"]`) || (chk ? chk.closest('.widget-toggle-item') : null);
    if (item) {
      item.classList.toggle('is-disabled', !isVisible);
      const badge = item.querySelector('.widget-toggle-badge');
      if (badge) {
        badge.textContent = isVisible ? 'ON' : 'OFF';
        badge.classList.toggle('status-off', !isVisible);
      }
    }
    if (!dashboardState.windows[windowId]) {
      dashboardState.windows[windowId] = {};
    }
    dashboardState.windows[windowId].visible = Boolean(isVisible);

    adjustGridForActiveWindows();

    if (isVisible && (windowId === 'current' || windowId === 'next')) {
      if (typeof updateSlides === 'function') {
        updateSlides(currentPage);
      }
    }

    saveDashboardState();
  }

  function adjustGridForActiveWindows() {
    if (!confDashboardGrid) return;
    const wins = dashboardState.windows || {};
    const isTimerVis = wins.timer?.visible !== false;
    const isClockVis = wins.clock?.visible !== false;
    const isCounterVis = wins.counter?.visible !== false;
    const isCurrentVis = wins.current?.visible !== false;
    const isNextVis = wins.next?.visible !== false;
    const isNotesVis = wins.notes?.visible !== false;
    const isCueVis = wins.cue?.visible !== false;

    // Top row adaptation:
    if (isTimerVis && !isClockVis && !isCounterVis) {
      setWindowSpan('timer', 'span-full');
    } else if (isTimerVis && (!isClockVis || !isCounterVis)) {
      setWindowSpan('timer', 'span-2');
      if (isClockVis) setWindowSpan('clock', 'span-2');
      if (isCounterVis) setWindowSpan('counter', 'span-2');
    } else if (!isTimerVis && isClockVis && isCounterVis) {
      setWindowSpan('clock', 'span-2');
      setWindowSpan('counter', 'span-2');
    } else if (!isTimerVis && isClockVis && !isCounterVis) {
      setWindowSpan('clock', 'span-full');
    } else if (!isTimerVis && !isClockVis && isCounterVis) {
      setWindowSpan('counter', 'span-full');
    } else if (isTimerVis && isClockVis && isCounterVis) {
      setWindowSpan('timer', 'span-1');
      setWindowSpan('clock', 'span-1');
      setWindowSpan('counter', 'span-1');
    }

    // Slides section adaptation:
    if (isCurrentVis && !isNextVis) {
      // Single-slide cinema view: Live Audience slide takes full width
      setWindowSpan('current', 'span-full');
    } else if (!isCurrentVis && isNextVis) {
      setWindowSpan('next', 'span-full');
    } else if (isCurrentVis && isNextVis) {
      setWindowSpan('current', 'span-2');
      setWindowSpan('next', 'span-2');
    }

    // Notes adaptation:
    if (isNotesVis && !isCueVis) {
      setWindowSpan('notes', 'span-full');
    } else if (isNotesVis && isCueVis) {
      setWindowSpan('notes', 'span-3');
      setWindowSpan('cue', 'span-1');
    }

    // Responsive grid row heights based on active rows:
    const hasTopRow = isTimerVis || isClockVis || isCounterVis;
    const hasSlidesRow = isCurrentVis || isNextVis;
    const hasBottomRow = isNotesVis || isCueVis;

    let topRowH = hasTopRow ? `var(--conf-row-top-h, calc(92px * var(--conf-scale, 1)))` : '0px';
    let bottomRowH = hasBottomRow ? `var(--conf-row-bottom-h, calc(148px * var(--conf-scale, 1)))` : '0px';
    let slidesRowH = hasSlidesRow ? `var(--conf-row-middle-h, 1fr)` : (hasBottomRow ? `var(--conf-row-middle-h, 1fr)` : 'auto');

    if (!hasSlidesRow && hasBottomRow) {
      bottomRowH = `var(--conf-row-bottom-h, 1fr)`;
    }

    confDashboardGrid.style.gridTemplateRows = `${topRowH} ${slidesRowH} ${bottomRowH}`;
  }

  function toggleDashboardLock(force) {
    isDashboardLocked = typeof force === 'boolean' ? force : !isDashboardLocked;
    dashboardState.locked = isDashboardLocked;

    const container = document.querySelector('.confidence-container');
    if (container) {
      container.classList.toggle('dashboard-locked', isDashboardLocked);
    }

    if (btnLockDashboard) {
      btnLockDashboard.textContent = isDashboardLocked ? '🔒 Locked' : '🔓 Unlock';
      btnLockDashboard.classList.toggle('active-locked', isDashboardLocked);
      btnLockDashboard.title = isDashboardLocked ? 'Unlock dashboard to allow drag-and-drop rearrangement' : 'Lock dashboard to prevent accidental dragging on stage';
    }

    document.querySelectorAll('.conf-dock-window').forEach(win => {
      win.setAttribute('draggable', isDashboardLocked ? 'false' : 'true');
    });

    saveDashboardState();
  }

  function applyDockPreset(presetName) {
    if (!confDashboardGrid) return;
    const container = document.querySelector('.confidence-container');
    if (container) {
      if (presetName === 'cockpit') {
        container.classList.remove('mode-seamless');
        container.classList.add('studio-edit-mode');
      } else {
        container.classList.add('mode-seamless');
        container.classList.remove('studio-edit-mode');
      }
    }
    const wins = dashboardState.windows || {};

    let order = DEFAULT_DASHBOARD_STATE.order;
    if (presetName === 'timer') {
      order = ['timer', 'current', 'next', 'notes', 'clock', 'counter', 'cue'];
    } else if (presetName === 'slides') {
      order = ['current', 'next', 'timer', 'clock', 'counter', 'notes', 'cue'];
    } else if (presetName === 'notes') {
      order = ['notes', 'current', 'timer', 'clock', 'next', 'counter', 'cue'];
    }

    // Reset inline overrides so template snaps into perfect proportions
    ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'].forEach(wid => {
      const el = getDockWindowEl(wid);
      if (el) el.style.gridColumn = '';
    });

    order.forEach(wid => {
      const el = getDockWindowEl(wid);
      if (el) {
        const isVisible = wins[wid]?.visible !== false;
        el.style.display = isVisible ? '' : 'none';
        confDashboardGrid.appendChild(el);
      }
      const chk = getCheckboxEl(wid);
      if (chk) {
        chk.checked = wins[wid]?.visible !== false;
      }
      const item = document.querySelector(`.widget-toggle-item[data-window-id="${wid}"]`) || (chk ? chk.closest('.widget-toggle-item') : null);
      if (item) {
        const isVisible = wins[wid]?.visible !== false;
        item.classList.toggle('is-disabled', !isVisible);
        const badge = item.querySelector('.widget-toggle-badge');
        if (badge) {
          badge.textContent = isVisible ? 'ON' : 'OFF';
          badge.classList.toggle('status-off', !isVisible);
        }
      }
    });

    if (presetName === 'timer') {
      setWindowSpan('timer', 'span-full');
      setWindowSpan('current', 'span-2');
      setWindowSpan('next', 'span-2');
      setWindowSpan('notes', 'span-full');
      setWindowSpan('clock', 'span-1');
      setWindowSpan('counter', 'span-1');
      setWindowSpan('cue', 'span-1');
      confDashboardGrid.style.setProperty('--conf-row-top-h', '180px');
    } else if (presetName === 'slides') {
      setWindowSpan('current', 'span-full');
      setWindowSpan('next', 'span-1');
      const nextEl = getDockWindowEl('next');
      if (nextEl) nextEl.style.display = 'none';
      setWindowSpan('timer', 'span-1');
      setWindowSpan('clock', 'span-1');
      setWindowSpan('counter', 'span-1');
      setWindowSpan('notes', 'span-full');
      setWindowSpan('cue', 'span-1');
    } else if (presetName === 'notes') {
      setWindowSpan('notes', 'span-full');
      setWindowSpan('current', 'span-2');
      setWindowSpan('next', 'span-2');
      setWindowSpan('timer', 'span-1');
      setWindowSpan('clock', 'span-1');
      setWindowSpan('counter', 'span-1');
      setWindowSpan('cue', 'span-1');
      confDashboardGrid.style.setProperty('--conf-row-bottom-h', '320px');
      notesFontSize = 34;
      if (confNotesText) confNotesText.style.fontSize = '34px';
    } else {
      setWindowSpan('timer', 'span-1');
      setWindowSpan('clock', 'span-1');
      setWindowSpan('counter', 'span-1');
      setWindowSpan('current', 'span-2');
      setWindowSpan('next', 'span-2');
      setWindowSpan('notes', 'span-3');
      setWindowSpan('cue', 'span-1');
      confDashboardGrid.style.setProperty('--conf-row-top-h', '92px');
      confDashboardGrid.style.setProperty('--conf-row-bottom-h', '148px');
      notesFontSize = 28;
      if (confNotesText) confNotesText.style.fontSize = '28px';
    }

    if (presetName !== 'slides') {
      const nextEl = getDockWindowEl('next');
      if (nextEl && wins.next?.visible !== false) nextEl.style.display = '';
    }

    adjustGridForActiveWindows();
    saveDashboardState();
  }

  function setWindowSpan(windowId, spanClass) {
    const win = getDockWindowEl(windowId);
    if (!win) return;
    win.classList.remove('span-1', 'span-2', 'span-3', 'span-full');
    win.classList.add(spanClass);
    if (dashboardState.windows[windowId]) {
      dashboardState.windows[windowId].span = spanClass;
    }
  }

  function setWindowRowSpan(windowId, rowSpanClass) {
    const win = getDockWindowEl(windowId);
    if (!win) return;
    win.classList.remove('row-span-1', 'row-span-2', 'row-span-full');
    win.classList.add(rowSpanClass);
    if (dashboardState.windows[windowId]) {
      dashboardState.windows[windowId].rowSpan = rowSpanClass;
    }
  }

  function cycleWindowWidth(windowId) {
    const win = getDockWindowEl(windowId);
    if (!win) return;
    const spans = ['span-1', 'span-2', 'span-3', 'span-full'];
    let currentSpan = spans.find(s => win.classList.contains(s)) || 'span-1';
    win.classList.remove('span-1', 'span-2', 'span-3', 'span-full');
    const nextSpan = spans[(spans.indexOf(currentSpan) + 1) % spans.length];
    win.classList.add(nextSpan);
    win.style.gridColumn = '';
    if (!dashboardState.windows[windowId]) dashboardState.windows[windowId] = {};
    dashboardState.windows[windowId].span = nextSpan;
    if (dashboardState.flexibleSpans) {
      delete dashboardState.flexibleSpans[windowId];
    }
    saveDashboardState();
    if (windowId === 'current' || windowId === 'next') {
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    }
  }

  function cycleWindowHeight(windowId) {
    const win = getDockWindowEl(windowId);
    if (!win) return;
    const rowSpans = ['row-span-1', 'row-span-2', 'row-span-full'];
    let currentRowSpan = rowSpans.find(s => win.classList.contains(s)) || 'row-span-1';
    win.classList.remove('row-span-1', 'row-span-2', 'row-span-full');
    const nextRowSpan = rowSpans[(rowSpans.indexOf(currentRowSpan) + 1) % rowSpans.length];
    win.classList.add(nextRowSpan);
    win.style.height = '';
    if (!dashboardState.windows[windowId]) dashboardState.windows[windowId] = {};
    dashboardState.windows[windowId].rowSpan = nextRowSpan;
    saveDashboardState();
    if (windowId === 'current' || windowId === 'next') {
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    }
  }

  function toggleWindowMaximize(windowId) {
    const win = getDockWindowEl(windowId);
    if (!win) return;
    const wasMaximized = win.classList.contains('is-maximized');

    document.querySelectorAll('.conf-dock-window.is-maximized').forEach(w => {
      w.classList.remove('is-maximized');
      const wid = w.dataset.windowId;
      if (wid && dashboardState.windows[wid]) {
        dashboardState.windows[wid].maximized = false;
      }
      updateMaxButtons(w, false);
    });

    if (!wasMaximized) {
      win.classList.add('is-maximized');
      if (!dashboardState.windows[windowId]) dashboardState.windows[windowId] = {};
      dashboardState.windows[windowId].maximized = true;
      updateMaxButtons(win, true);
    }

    saveDashboardState();
    if (windowId === 'current' || windowId === 'next') {
      if (typeof updateSlides === 'function') updateSlides(currentPage);
    }
  }

  function updateMaxButtons(winEl, isMax) {
    if (!winEl) return;
    const maxBtns = winEl.querySelectorAll('.btn-hud-max, .btn-dock-max');
    maxBtns.forEach(btn => {
      btn.textContent = isMax ? '↙' : '⤢';
      btn.title = isMax ? 'Restore Window Size (↙ / Double-click)' : 'Maximize Window (⤢ / Double-click)';
      btn.classList.toggle('is-active', isMax);
    });
  }

  function resetDashboardLayout() {
    dashboardState = JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_STATE));
    if (confDashboardGrid) {
      confDashboardGrid.style.removeProperty('--conf-row-top-h');
      confDashboardGrid.style.removeProperty('--conf-row-middle-h');
      confDashboardGrid.style.removeProperty('--conf-row-bottom-h');
      dashboardState.order.forEach(wid => {
        const el = getDockWindowEl(wid);
        if (el) {
          el.style.display = '';
          el.style.gridColumn = '';
          el.style.width = '';
          el.style.height = '';
          el.classList.remove('is-collapsed', 'is-maximized', 'span-1', 'span-2', 'span-3', 'span-full', 'row-span-1', 'row-span-2', 'row-span-full');
          el.classList.add(dashboardState.windows[wid]?.span || 'span-1');
          el.classList.add(dashboardState.windows[wid]?.rowSpan || 'row-span-1');
          const btnCollapse = el.querySelector('.btn-dock-collapse');
          if (btnCollapse) btnCollapse.textContent = '▾';
          updateMaxButtons(el, false);
          confDashboardGrid.appendChild(el);
        }
        const chk = getCheckboxEl(wid);
        if (chk) chk.checked = true;
        const item = document.querySelector(`.widget-toggle-item[data-window-id="${wid}"]`) || (chk ? chk.closest('.widget-toggle-item') : null);
        if (item) {
          item.classList.remove('is-disabled');
          const badge = item.querySelector('.widget-toggle-badge');
          if (badge) {
            badge.textContent = 'ON';
            badge.classList.remove('status-off');
          }
        }
      });
    }
    delete dashboardState.flexibleSpans;
    delete dashboardState.flexibleRows;
    toggleDashboardLock(false);
    adjustGridForActiveWindows();
    saveDashboardState();
    if (typeof applyLayout === 'function') {
      applyLayout({ activePreset: 'balanced' }, true);
    }
    if (typeof syncDrawerControlsFromState === 'function') {
      syncDrawerControlsFromState();
    }
    if (typeof updateSlides === 'function') {
      updateSlides(currentPage);
    }
  }

  function saveDashboardState() {
    const container = document.querySelector('.confidence-container');
    if (container) {
      dashboardState.mode = container.classList.contains('mode-seamless') ? 'seamless' : 'modular';
    }
    if (confDashboardGrid) {
      const currentOrder = Array.from(confDashboardGrid.children)
        .map(c => c.dataset ? c.dataset.windowId : null)
        .filter(Boolean);
      if (currentOrder.length > 0) {
        dashboardState.order = currentOrder;
      }
      dashboardState.flexibleSpans = {};
      ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'].forEach(wid => {
        const win = getDockWindowEl(wid);
        if (win && win.style.gridColumn) {
          dashboardState.flexibleSpans[wid] = win.style.gridColumn;
        }
      });
      dashboardState.flexibleRows = {
        topH: confDashboardGrid.style.getPropertyValue('--conf-row-top-h') || null,
        middleH: confDashboardGrid.style.getPropertyValue('--conf-row-middle-h') || null,
        bottomH: confDashboardGrid.style.getPropertyValue('--conf-row-bottom-h') || null
      };
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_DASHBOARD, JSON.stringify(dashboardState));
      } catch (e) {}
    }
  }

  function loadDashboardState() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DASHBOARD);
      if (stored) {
        const parsed = JSON.parse(stored);
        dashboardState = { ...DEFAULT_DASHBOARD_STATE, ...parsed };

        const container = document.querySelector('.confidence-container');
        if (container) {
          if (dashboardState.mode === 'modular') {
            container.classList.remove('mode-seamless');
          } else {
            container.classList.add('mode-seamless');
          }
        }

        if (confDashboardGrid && Array.isArray(dashboardState.order)) {
          dashboardState.order.forEach(wid => {
            const el = getDockWindowEl(wid);
            if (el) confDashboardGrid.appendChild(el);
          });
        }

        if (dashboardState.windows) {
          Object.entries(dashboardState.windows).forEach(([wid, cfg]) => {
            const el = getDockWindowEl(wid);
            if (!el) return;
            if (typeof cfg.visible === 'boolean') {
              el.style.display = cfg.visible ? '' : 'none';
              const chk = getCheckboxEl(wid);
              if (chk) chk.checked = cfg.visible;
              const item = document.querySelector(`.widget-toggle-item[data-window-id="${wid}"]`) || (chk ? chk.closest('.widget-toggle-item') : null);
              if (item) {
                item.classList.toggle('is-disabled', !cfg.visible);
                const badge = item.querySelector('.widget-toggle-badge');
                if (badge) {
                  badge.textContent = cfg.visible ? 'ON' : 'OFF';
                  badge.classList.toggle('status-off', !cfg.visible);
                }
              }
            }
            if (cfg.collapsed) {
              el.classList.add('is-collapsed');
              const btnCollapse = el.querySelector('.btn-dock-collapse');
              if (btnCollapse) btnCollapse.textContent = '▸';
            }
            if (cfg.span) {
              el.classList.remove('span-1', 'span-2', 'span-3', 'span-full');
              el.classList.add(cfg.span);
            }
            if (cfg.rowSpan) {
              el.classList.remove('row-span-1', 'row-span-2', 'row-span-full');
              el.classList.add(cfg.rowSpan);
            }
            if (cfg.maximized) {
              el.classList.add('is-maximized');
              updateMaxButtons(el, true);
            }
          });
          adjustGridForActiveWindows();
        }

        if (dashboardState.flexibleSpans && confDashboardGrid) {
          Object.entries(dashboardState.flexibleSpans).forEach(([wid, spanVal]) => {
            const win = getDockWindowEl(wid);
            if (win && spanVal) {
              win.style.gridColumn = spanVal;
            }
          });
        }
        if (dashboardState.flexibleRows && confDashboardGrid) {
          if (dashboardState.flexibleRows.topH) {
            confDashboardGrid.style.setProperty('--conf-row-top-h', dashboardState.flexibleRows.topH);
          }
          if (dashboardState.flexibleRows.middleH) {
            confDashboardGrid.style.setProperty('--conf-row-middle-h', dashboardState.flexibleRows.middleH);
          }
          if (dashboardState.flexibleRows.bottomH) {
            confDashboardGrid.style.setProperty('--conf-row-bottom-h', dashboardState.flexibleRows.bottomH);
          }
        }

        if (typeof dashboardState.locked === 'boolean') {
          toggleDashboardLock(dashboardState.locked);
        }
      }
    } catch (e) {}
  }

  function initWindowResizers(win) {
    if (!win) return;
    const resizerR = win.querySelector('.conf-dock-resizer-r');
    const resizerB = win.querySelector('.conf-dock-resizer-b');
    const resizerSE = win.querySelector('.conf-dock-resizer-se');
    const windowId = win.dataset.windowId;

    function getRowPair(wid) {
      if (wid === 'current') return getDockWindowEl('next');
      if (wid === 'next') return getDockWindowEl('current');
      if (wid === 'timer') return getDockWindowEl('clock') || getDockWindowEl('counter');
      if (wid === 'clock') return getDockWindowEl('counter') || getDockWindowEl('timer');
      if (wid === 'counter') return getDockWindowEl('clock');
      if (wid === 'notes') return getDockWindowEl('cue');
      if (wid === 'cue') return getDockWindowEl('notes');
      return null;
    }

    // --- 1. HORIZONTAL RESIZING (Right Edge: Continuous Click-and-Drag) ---
    if (resizerR) {
      let isDragging = false;
      let startX = 0;
      let startWinW = 0;
      let startPairW = 0;
      let pairEl = null;

      resizerR.addEventListener('pointerdown', (e) => {
        if (isDashboardLocked) return;
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        const winRect = win.getBoundingClientRect();
        startWinW = winRect.width;

        pairEl = getRowPair(windowId);
        if (pairEl && pairEl.style.display !== 'none') {
          const pairRect = pairEl.getBoundingClientRect();
          if (Math.abs(winRect.top - pairRect.top) < 35) {
            startPairW = pairRect.width;
          } else {
            pairEl = null;
          }
        } else {
          pairEl = null;
        }

        resizerR.classList.add('is-resizing');
        document.body.classList.add('conf-resizing-col');
        if (typeof resizerR.setPointerCapture === 'function') {
          try { resizerR.setPointerCapture(e.pointerId); } catch (err) {}
        }
      });

      resizerR.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        if (pairEl) {
          const totalW = startWinW + startPairW;
          if (totalW > 0) {
            const newWinW = Math.max(60, Math.min(totalW - 60, startWinW + deltaX));
            const pct = newWinW / totalW;
            const spanWin = Math.max(15, Math.min(105, Math.round(pct * 120)));
            const spanPair = 120 - spanWin;
            win.style.gridColumn = `span ${spanWin}`;
            pairEl.style.gridColumn = `span ${spanPair}`;
          }
        } else if (confDashboardGrid) {
          const gridW = confDashboardGrid.getBoundingClientRect().width;
          if (gridW > 0) {
            const newW = Math.max(60, Math.min(gridW, startWinW + deltaX));
            const span = Math.max(15, Math.min(120, Math.round((newW / gridW) * 120)));
            win.style.gridColumn = `span ${span}`;
          }
        }
      });

      const stopR = (e) => {
        if (!isDragging) return;
        isDragging = false;
        resizerR.classList.remove('is-resizing');
        document.body.classList.remove('conf-resizing-col');
        if (typeof resizerR.releasePointerCapture === 'function') {
          try { resizerR.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        saveDashboardState();
        if (windowId === 'current' || windowId === 'next') {
          if (typeof updateSlides === 'function') updateSlides(currentPage);
        }
      };

      resizerR.addEventListener('pointerup', stopR);
      resizerR.addEventListener('pointercancel', stopR);

      // Double-click to reset horizontal width to balanced default
      resizerR.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        win.style.gridColumn = '';
        const pair = getRowPair(windowId);
        if (pair) pair.style.gridColumn = '';
        adjustGridForActiveWindows();
        saveDashboardState();
        if (windowId === 'current' || windowId === 'next') {
          if (typeof updateSlides === 'function') updateSlides(currentPage);
        }
      });
    }

    // --- 2. VERTICAL RESIZING (Bottom Edge: Continuous Click-and-Drag) ---
    if (resizerB) {
      let isDragging = false;
      let startY = 0;
      let startH = 0;

      resizerB.addEventListener('pointerdown', (e) => {
        if (isDashboardLocked) return;
        e.stopPropagation();
        isDragging = true;
        startY = e.clientY;
        startH = win.getBoundingClientRect().height;
        resizerB.classList.add('is-resizing');
        document.body.classList.add('conf-resizing-row');
        if (typeof resizerB.setPointerCapture === 'function') {
          try { resizerB.setPointerCapture(e.pointerId); } catch (err) {}
        }
      });

      resizerB.addEventListener('pointermove', (e) => {
        if (!isDragging || !confDashboardGrid) return;
        const gridRect = confDashboardGrid.getBoundingClientRect();
        const deltaY = e.clientY - startY;

        if (windowId === 'timer' || windowId === 'clock' || windowId === 'counter') {
          const newTopH = Math.max(50, Math.min(Math.round(gridRect.height * 0.55), startH + deltaY));
          confDashboardGrid.style.setProperty('--conf-row-top-h', `${newTopH}px`);
          if (confTopBar) confTopBar.style.height = `${newTopH}px`;
        } else if (windowId === 'current' || windowId === 'next') {
          const newBottomH = Math.max(60, Math.min(Math.round(gridRect.height * 0.65), gridRect.bottom - e.clientY));
          confDashboardGrid.style.setProperty('--conf-row-bottom-h', `${newBottomH}px`);
          confDashboardGrid.style.setProperty('--conf-row-middle-h', '1fr');
        } else if (windowId === 'notes' || windowId === 'cue') {
          const newBottomH = Math.max(60, Math.min(Math.round(gridRect.height * 0.7), startH + deltaY));
          confDashboardGrid.style.setProperty('--conf-row-bottom-h', `${newBottomH}px`);
        }
      });

      const stopB = (e) => {
        if (!isDragging) return;
        isDragging = false;
        resizerB.classList.remove('is-resizing');
        document.body.classList.remove('conf-resizing-row');
        if (typeof resizerB.releasePointerCapture === 'function') {
          try { resizerB.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        saveDashboardState();
        if (typeof updateSlides === 'function') updateSlides(currentPage);
      };

      resizerB.addEventListener('pointerup', stopB);
      resizerB.addEventListener('pointercancel', stopB);

      // Double-click to reset vertical height to balanced defaults
      resizerB.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (confDashboardGrid) {
          if (windowId === 'timer' || windowId === 'clock' || windowId === 'counter') {
            confDashboardGrid.style.removeProperty('--conf-row-top-h');
          } else {
            confDashboardGrid.style.removeProperty('--conf-row-middle-h');
            confDashboardGrid.style.removeProperty('--conf-row-bottom-h');
          }
        }
        adjustGridForActiveWindows();
        saveDashboardState();
        if (typeof updateSlides === 'function') updateSlides(currentPage);
      });
    }

    // --- 3. CORNER RESIZING (SE Corner: Width + Height Simultaneously) ---
    if (resizerSE) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startWinW = 0;
      let startPairW = 0;
      let pairEl = null;
      let startH = 0;

      resizerSE.addEventListener('pointerdown', (e) => {
        if (isDashboardLocked) return;
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const winRect = win.getBoundingClientRect();
        startWinW = winRect.width;
        startH = winRect.height;

        pairEl = getRowPair(windowId);
        if (pairEl && pairEl.style.display !== 'none') {
          const pairRect = pairEl.getBoundingClientRect();
          if (Math.abs(winRect.top - pairRect.top) < 35) {
            startPairW = pairRect.width;
          } else {
            pairEl = null;
          }
        } else {
          pairEl = null;
        }

        resizerSE.classList.add('is-resizing');
        document.body.classList.add('conf-resizing-se');
        if (typeof resizerSE.setPointerCapture === 'function') {
          try { resizerSE.setPointerCapture(e.pointerId); } catch (err) {}
        }
      });

      resizerSE.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Width
        if (pairEl) {
          const totalW = startWinW + startPairW;
          if (totalW > 0) {
            const newWinW = Math.max(60, Math.min(totalW - 60, startWinW + deltaX));
            const pct = newWinW / totalW;
            const spanWin = Math.max(15, Math.min(105, Math.round(pct * 120)));
            const spanPair = 120 - spanWin;
            win.style.gridColumn = `span ${spanWin}`;
            pairEl.style.gridColumn = `span ${spanPair}`;
          }
        } else if (confDashboardGrid) {
          const gridW = confDashboardGrid.getBoundingClientRect().width;
          if (gridW > 0) {
            const newW = Math.max(60, Math.min(gridW, startWinW + deltaX));
            const span = Math.max(15, Math.min(120, Math.round((newW / gridW) * 120)));
            win.style.gridColumn = `span ${span}`;
          }
        }

        // Height
        if (confDashboardGrid) {
          const gridRect = confDashboardGrid.getBoundingClientRect();
          if (windowId === 'timer' || windowId === 'clock' || windowId === 'counter') {
            const newTopH = Math.max(50, Math.min(Math.round(gridRect.height * 0.55), startH + deltaY));
            confDashboardGrid.style.setProperty('--conf-row-top-h', `${newTopH}px`);
          } else if (windowId === 'current' || windowId === 'next') {
            const newBottomH = Math.max(60, Math.min(Math.round(gridRect.height * 0.65), gridRect.bottom - e.clientY));
            confDashboardGrid.style.setProperty('--conf-row-bottom-h', `${newBottomH}px`);
            confDashboardGrid.style.setProperty('--conf-row-middle-h', '1fr');
          } else if (windowId === 'notes' || windowId === 'cue') {
            const newBottomH = Math.max(60, Math.min(Math.round(gridRect.height * 0.7), startH + deltaY));
            confDashboardGrid.style.setProperty('--conf-row-bottom-h', `${newBottomH}px`);
          }
        }
      });

      const stopSE = (e) => {
        if (!isDragging) return;
        isDragging = false;
        resizerSE.classList.remove('is-resizing');
        document.body.classList.remove('conf-resizing-se');
        if (typeof resizerSE.releasePointerCapture === 'function') {
          try { resizerSE.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        saveDashboardState();
        if (typeof updateSlides === 'function') updateSlides(currentPage);
      };

      resizerSE.addEventListener('pointerup', stopSE);
      resizerSE.addEventListener('pointercancel', stopSE);

      // Double-click to reset both
      resizerSE.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        win.style.gridColumn = '';
        const pair = getRowPair(windowId);
        if (pair) pair.style.gridColumn = '';
        if (confDashboardGrid) {
          if (windowId === 'timer' || windowId === 'clock' || windowId === 'counter') {
            confDashboardGrid.style.removeProperty('--conf-row-top-h');
          } else {
            confDashboardGrid.style.removeProperty('--conf-row-middle-h');
            confDashboardGrid.style.removeProperty('--conf-row-bottom-h');
          }
        }
        adjustGridForActiveWindows();
        saveDashboardState();
        if (typeof updateSlides === 'function') updateSlides(currentPage);
      });
    }
  }

  function initDockableDashboard() {
    const dockWindows = document.querySelectorAll('.conf-dock-window');
    dockWindows.forEach(win => {
      initWindowResizers(win);
      win.addEventListener('dragstart', (e) => {
        if (isDashboardLocked ||
            e.target.closest('.conf-dock-resizer') ||
            e.target.closest('.conf-window-hud') ||
            e.target.closest('button, input, textarea, canvas, a, .conf-notes-viewport, .conf-font-controls')) {
          e.preventDefault();
          return false;
        }
        draggedWindow = win;
        win.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', win.dataset.windowId || '');
        }
      });

      win.addEventListener('dragover', (e) => {
        if (isDashboardLocked || !draggedWindow || draggedWindow === win) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = win.getBoundingClientRect();
        const isAfter = (e.clientX - rect.left) > (rect.width / 2);
        if (isAfter) {
          win.classList.add('drop-target-after');
          win.classList.remove('drop-target-before');
        } else {
          win.classList.add('drop-target-before');
          win.classList.remove('drop-target-after');
        }
      });

      win.addEventListener('dragleave', () => {
        win.classList.remove('drop-target-before', 'drop-target-after');
      });

      win.addEventListener('drop', (e) => {
        if (isDashboardLocked || !draggedWindow || draggedWindow === win) return;
        e.preventDefault();
        const isAfter = win.classList.contains('drop-target-after');
        win.classList.remove('drop-target-before', 'drop-target-after');

        if (confDashboardGrid) {
          if (isAfter) {
            confDashboardGrid.insertBefore(draggedWindow, win.nextSibling);
          } else {
            confDashboardGrid.insertBefore(draggedWindow, win);
          }
        }
        saveDashboardState();
      });

      win.addEventListener('dragend', () => {
        if (draggedWindow) draggedWindow.classList.remove('is-dragging');
        draggedWindow = null;
        document.querySelectorAll('.conf-dock-window').forEach(w => {
          w.classList.remove('drop-target-before', 'drop-target-after', 'is-dragging');
        });
      });

      const btnCollapse = win.querySelector('.btn-dock-collapse');
      if (btnCollapse) {
        btnCollapse.addEventListener('click', (e) => {
          e.stopPropagation();
          const isCollapsed = win.classList.toggle('is-collapsed');
          btnCollapse.textContent = isCollapsed ? '▸' : '▾';
          btnCollapse.title = isCollapsed ? 'Expand Window' : 'Collapse Window';
          const wid = win.dataset.windowId;
          if (wid && dashboardState.windows[wid]) {
            dashboardState.windows[wid].collapsed = isCollapsed;
            saveDashboardState();
          }
        });
      }

      // Interactive Size Drawer Openers (Floating HUD & Dock Header 📐 Button)
      const editorBtns = win.querySelectorAll('.btn-hud-editor, .btn-dock-editor');
      editorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wid = win.dataset.windowId;
          let group = 'slides';
          if (wid === 'timer' || wid === 'clock' || wid === 'counter') group = 'top';
          else if (wid === 'notes' || wid === 'cue') group = 'bottom';
          openTabSizeDrawer(group);
        });
      });

      // Interactive Width Controls (Floating HUD & Dock Header)
      const widthBtns = win.querySelectorAll('.btn-hud-width, .btn-dock-span');
      widthBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wid = win.dataset.windowId;
          if (wid) cycleWindowWidth(wid);
        });
      });

      // Interactive Height Controls (Floating HUD & Dock Header)
      const heightBtns = win.querySelectorAll('.btn-hud-height, .btn-dock-height');
      heightBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wid = win.dataset.windowId;
          if (wid) cycleWindowHeight(wid);
        });
      });

      // Interactive Maximize Controls (Floating HUD & Dock Header)
      const maxBtns = win.querySelectorAll('.btn-hud-max, .btn-dock-max');
      maxBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const wid = win.dataset.windowId;
          if (wid) toggleWindowMaximize(wid);
        });
      });

      // Double-Click Window or Header to Maximize / Restore
      win.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, canvas, input, a, .conf-notes-viewport, .conf-font-controls')) return;
        const wid = win.dataset.windowId;
        if (wid) toggleWindowMaximize(wid);
      });

      const btnClose = win.querySelector('.btn-dock-close');
      if (btnClose) {
        btnClose.addEventListener('click', (e) => {
          e.stopPropagation();
          const wid = win.dataset.windowId;
          if (wid) setWindowVisibility(wid, false);
        });
      }
    });

    if (btnLockDashboard) {
      btnLockDashboard.addEventListener('click', () => toggleDashboardLock());
    }

    if (btnResetLayout) {
      btnResetLayout.addEventListener('click', () => resetDashboardLayout());
    }

    if (btnWidgetsMenu && confWidgetsDropdown) {
      btnWidgetsMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = confWidgetsDropdown.style.display !== 'none';
        confWidgetsDropdown.style.display = isOpen ? 'none' : 'flex';
      });

      confWidgetsDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      document.addEventListener('click', (e) => {
        if (!confWidgetsDropdown.contains(e.target) && e.target !== btnWidgetsMenu) {
          confWidgetsDropdown.style.display = 'none';
        }
      });

      ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'].forEach(wid => {
        const chk = getCheckboxEl(wid);
        const item = document.querySelector(`.widget-toggle-item[data-window-id="${wid}"]`) || (chk ? chk.closest('.widget-toggle-item') : null);

        if (item) {
          item.addEventListener('click', (e) => {
            if (e.target !== chk) {
              e.preventDefault();
              if (chk) {
                chk.checked = !chk.checked;
              }
            }
            if (chk) {
              setWindowVisibility(wid, chk.checked);
            }
          });

          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (chk) {
                chk.checked = !chk.checked;
                setWindowVisibility(wid, chk.checked);
              }
            }
          });
        }
      });
    }

    loadDashboardState();
  }

  initDockableDashboard();

  // =========================================================================
  // 2.9. INTERACTIVE TAB SIZE DRAWER & REAL-TIME WIDTH/HEIGHT CONTROLLER
  // =========================================================================
  const confTabSizeDrawer = document.getElementById('confTabSizeDrawer');
  const btnEditTabSizes = document.getElementById('btnEditTabSizes');
  const btnCloseTabSizeDrawer = document.getElementById('btnCloseTabSizeDrawer');

  // Sliders and badges
  const sliderSlidesSplit = document.getElementById('sliderSlidesSplit');
  const btnSlideCurrentLess = document.getElementById('btnSlideCurrentLess');
  const btnSlideCurrentMore = document.getElementById('btnSlideCurrentMore');
  const valSlidesSplit = document.getElementById('valSlidesSplit');
  const badgeSlidesSplit = document.getElementById('badgeSlidesSplit');

  const sliderSlidesHeight = document.getElementById('sliderSlidesHeight');
  const btnSlidesHeightLess = document.getElementById('btnSlidesHeightLess');
  const btnSlidesHeightMore = document.getElementById('btnSlidesHeightMore');
  const badgeSlidesHeight = document.getElementById('badgeSlidesHeight');

  const sliderTopHeight = document.getElementById('sliderTopHeight');
  const btnTopHeightLess = document.getElementById('btnTopHeightLess');
  const btnTopHeightMore = document.getElementById('btnTopHeightMore');
  const valTopHeight = document.getElementById('valTopHeight');
  const badgeTopHeight = document.getElementById('badgeTopHeight');

  const sliderTimerWidth = document.getElementById('sliderTimerWidth');
  const btnTimerWidthLess = document.getElementById('btnTimerWidthLess');
  const btnTimerWidthMore = document.getElementById('btnTimerWidthMore');
  const badgeTimerWidth = document.getElementById('badgeTimerWidth');

  const sliderBottomHeight = document.getElementById('sliderBottomHeight');
  const btnBottomHeightLess = document.getElementById('btnBottomHeightLess');
  const btnBottomHeightMore = document.getElementById('btnBottomHeightMore');
  const valBottomHeight = document.getElementById('valBottomHeight');
  const badgeBottomHeight = document.getElementById('badgeBottomHeight');

  const sliderNotesWidth = document.getElementById('sliderNotesWidth');
  const btnNotesWidthLess = document.getElementById('btnNotesWidthLess');
  const btnNotesWidthMore = document.getElementById('btnNotesWidthMore');
  const badgeNotesWidth = document.getElementById('badgeNotesWidth');

  // Quick Preset Buttons
  const presetSplitBalanced = document.getElementById('presetSplitBalanced');
  const presetSplitCinema = document.getElementById('presetSplitCinema');
  const presetSplitNotes = document.getElementById('presetSplitNotes');
  const presetSplitTimer = document.getElementById('presetSplitTimer');
  const presetSplitReset = document.getElementById('presetSplitReset');

  function openTabSizeDrawer(focusTabGroup) {
    if (!confTabSizeDrawer) return;
    confTabSizeDrawer.style.display = 'block';
    if (btnEditTabSizes) {
      btnEditTabSizes.classList.add('active');
    }
    syncDrawerControlsFromState();
    if (focusTabGroup) {
      const card = document.querySelector(`.drawer-tab-card[data-tab-group="${focusTabGroup}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        card.classList.add('card-highlight');
        setTimeout(() => card.classList.remove('card-highlight'), 1200);
      }
    }
  }

  function closeTabSizeDrawer() {
    if (!confTabSizeDrawer) return;
    confTabSizeDrawer.style.display = 'none';
    if (btnEditTabSizes) {
      btnEditTabSizes.classList.remove('active');
    }
  }

  function toggleTabSizeDrawer() {
    if (!confTabSizeDrawer) return;
    if (confTabSizeDrawer.style.display === 'none' || !confTabSizeDrawer.style.display) {
      openTabSizeDrawer();
    } else {
      closeTabSizeDrawer();
    }
  }

  function setSlidesSplit(percentCurrent, save = true) {
    const curPercent = Math.max(15, Math.min(85, Math.round(Number(percentCurrent) || 50)));
    const nextPercent = 100 - curPercent;
    const spanCur = Math.max(15, Math.min(105, Math.round((curPercent / 100) * 120)));
    const spanNext = 120 - spanCur;

    const curWin = getDockWindowEl('current');
    const nextWin = getDockWindowEl('next');
    if (curWin) curWin.style.gridColumn = `span ${spanCur}`;
    if (nextWin) nextWin.style.gridColumn = `span ${spanNext}`;

    if (sliderSlidesSplit) sliderSlidesSplit.value = curPercent;
    if (valSlidesSplit) valSlidesSplit.textContent = `${curPercent}% / ${nextPercent}%`;
    if (badgeSlidesSplit) badgeSlidesSplit.textContent = `${curPercent}% / ${nextPercent}%`;

    if (save) saveDashboardState();
    if (typeof updateSlides === 'function') updateSlides(currentPage);
  }

  function setTopBarHeight(pixels, save = true) {
    const h = Math.max(60, Math.min(260, Math.round(Number(pixels) || 92)));
    if (confDashboardGrid) {
      confDashboardGrid.style.setProperty('--conf-row-top-h', `${h}px`);
    }
    if (confTopBar) {
      confTopBar.style.height = `${h}px`;
    }
    const timerFontSize = Math.round(Math.max(36, Math.min(110, h * 0.45)));
    if (confTimerDisplay) {
      confTimerDisplay.style.fontSize = `${timerFontSize}px`;
    }

    if (sliderTopHeight) sliderTopHeight.value = h;
    if (valTopHeight) valTopHeight.textContent = `${h}px`;
    if (badgeTopHeight) badgeTopHeight.textContent = `${h}px`;

    if (save) saveDashboardState();
    if (typeof updateSlides === 'function') updateSlides(currentPage);
  }

  function setTimerWidth(percent, save = true) {
    const pct = Math.max(20, Math.min(80, Math.round(Number(percent) || 33)));
    const colsTimer = Math.max(24, Math.min(96, Math.round((pct / 100) * 120)));
    const remainingCols = 120 - colsTimer;
    const colsClock = Math.floor(remainingCols / 2);
    const colsCounter = remainingCols - colsClock;

    const timerWin = getDockWindowEl('timer');
    const clockWin = getDockWindowEl('clock');
    const counterWin = getDockWindowEl('counter');

    if (timerWin) timerWin.style.gridColumn = `span ${colsTimer}`;
    if (clockWin) clockWin.style.gridColumn = `span ${colsClock}`;
    if (counterWin) counterWin.style.gridColumn = `span ${colsCounter}`;

    if (sliderTimerWidth) sliderTimerWidth.value = pct;
    if (badgeTimerWidth) badgeTimerWidth.textContent = `${pct}% (${colsTimer} cols)`;

    if (save) saveDashboardState();
  }

  function setBottomNotesHeight(pixels, save = true) {
    const h = Math.max(70, Math.min(450, Math.round(Number(pixels) || 148)));
    if (confDashboardGrid) {
      confDashboardGrid.style.setProperty('--conf-row-bottom-h', `${h}px`);
      confDashboardGrid.style.setProperty('--conf-row-middle-h', '1fr');
    }

    if (sliderBottomHeight) sliderBottomHeight.value = h;
    if (sliderSlidesHeight) sliderSlidesHeight.value = h;
    if (valBottomHeight) valBottomHeight.textContent = `${h}px`;
    if (badgeBottomHeight) badgeBottomHeight.textContent = `${h}px`;
    if (badgeSlidesHeight) badgeSlidesHeight.textContent = `Notes: ${h}px | Slides: 1fr`;

    if (save) saveDashboardState();
    if (typeof updateSlides === 'function') updateSlides(currentPage);
  }

  function setNotesWidth(percent, save = true) {
    const pct = Math.max(25, Math.min(100, Math.round(Number(percent) || 67)));
    const colsNotes = Math.max(30, Math.min(120, Math.round((pct / 100) * 120)));
    const colsCue = Math.max(0, 120 - colsNotes);

    const notesWin = getDockWindowEl('notes');
    const cueWin = getDockWindowEl('cue');

    if (notesWin) notesWin.style.gridColumn = `span ${colsNotes}`;
    if (cueWin) {
      if (colsCue > 0) {
        cueWin.style.gridColumn = `span ${colsCue}`;
      } else {
        cueWin.style.gridColumn = 'span 120';
      }
    }

    if (sliderNotesWidth) sliderNotesWidth.value = pct;
    if (badgeNotesWidth) badgeNotesWidth.textContent = `${pct}% (${colsNotes} cols)`;

    if (save) saveDashboardState();
  }

  function syncDrawerControlsFromState() {
    // 1. Slides Split
    const curWin = getDockWindowEl('current');
    let splitPct = 50;
    if (curWin && curWin.style.gridColumn) {
      const match = curWin.style.gridColumn.match(/span\s+(\d+)/);
      if (match) {
        splitPct = Math.round((parseInt(match[1], 10) / 120) * 100);
      }
    }
    if (sliderSlidesSplit) sliderSlidesSplit.value = splitPct;
    if (valSlidesSplit) valSlidesSplit.textContent = `${splitPct}% / ${100 - splitPct}%`;
    if (badgeSlidesSplit) badgeSlidesSplit.textContent = `${splitPct}% / ${100 - splitPct}%`;

    // 2. Top Height
    let topPx = 92;
    if (confDashboardGrid) {
      const topHVal = confDashboardGrid.style.getPropertyValue('--conf-row-top-h');
      if (topHVal) {
        const px = parseInt(topHVal, 10);
        if (!isNaN(px)) topPx = px;
      }
    }
    if (sliderTopHeight) sliderTopHeight.value = topPx;
    if (valTopHeight) valTopHeight.textContent = `${topPx}px`;
    if (badgeTopHeight) badgeTopHeight.textContent = `${topPx}px`;

    // 3. Bottom Height
    let btmPx = 148;
    if (confDashboardGrid) {
      const btmHVal = confDashboardGrid.style.getPropertyValue('--conf-row-bottom-h');
      if (btmHVal) {
        const px = parseInt(btmHVal, 10);
        if (!isNaN(px)) btmPx = px;
      }
    }
    if (sliderBottomHeight) sliderBottomHeight.value = btmPx;
    if (sliderSlidesHeight) sliderSlidesHeight.value = btmPx;
    if (valBottomHeight) valBottomHeight.textContent = `${btmPx}px`;
    if (badgeBottomHeight) badgeBottomHeight.textContent = `${btmPx}px`;
    if (badgeSlidesHeight) badgeSlidesHeight.textContent = `Notes: ${btmPx}px | Slides: 1fr`;

    // 4. Timer Width
    let timerPct = 33;
    let timerCols = 40;
    const timerWin = getDockWindowEl('timer');
    if (timerWin && timerWin.style.gridColumn) {
      const match = timerWin.style.gridColumn.match(/span\s+(\d+)/);
      if (match) {
        timerCols = parseInt(match[1], 10);
        timerPct = Math.round((timerCols / 120) * 100);
      }
    }
    if (sliderTimerWidth) sliderTimerWidth.value = timerPct;
    if (badgeTimerWidth) badgeTimerWidth.textContent = `${timerPct}% (${timerCols} cols)`;

    // 5. Notes Width
    let notesPct = 67;
    let notesCols = 80;
    const notesWin = getDockWindowEl('notes');
    if (notesWin && notesWin.style.gridColumn) {
      const match = notesWin.style.gridColumn.match(/span\s+(\d+)/);
      if (match) {
        notesCols = parseInt(match[1], 10);
        notesPct = Math.round((notesCols / 120) * 100);
      }
    }
    if (sliderNotesWidth) sliderNotesWidth.value = notesPct;
    if (badgeNotesWidth) badgeNotesWidth.textContent = `${notesPct}% (${notesCols} cols)`;
  }

  function initTabSizeDrawer() {
    if (btnEditTabSizes) {
      btnEditTabSizes.addEventListener('click', () => toggleTabSizeDrawer());
    }
    if (btnCloseTabSizeDrawer) {
      btnCloseTabSizeDrawer.addEventListener('click', () => closeTabSizeDrawer());
    }

    // Slides Split Slider & Step Buttons
    if (sliderSlidesSplit) {
      sliderSlidesSplit.addEventListener('input', (e) => setSlidesSplit(e.target.value, false));
      sliderSlidesSplit.addEventListener('change', (e) => setSlidesSplit(e.target.value, true));
    }
    if (btnSlideCurrentLess) {
      btnSlideCurrentLess.addEventListener('click', () => {
        const cur = Number(sliderSlidesSplit?.value || 50);
        setSlidesSplit(cur - 5, true);
      });
    }
    if (btnSlideCurrentMore) {
      btnSlideCurrentMore.addEventListener('click', () => {
        const cur = Number(sliderSlidesSplit?.value || 50);
        setSlidesSplit(cur + 5, true);
      });
    }

    // Slides vs Notes Height Slider & Step Buttons
    if (sliderSlidesHeight) {
      sliderSlidesHeight.addEventListener('input', (e) => setBottomNotesHeight(e.target.value, false));
      sliderSlidesHeight.addEventListener('change', (e) => setBottomNotesHeight(e.target.value, true));
    }
    if (btnSlidesHeightLess) {
      btnSlidesHeightLess.addEventListener('click', () => {
        const cur = Number(sliderBottomHeight?.value || 148);
        setBottomNotesHeight(cur + 20, true);
      });
    }
    if (btnSlidesHeightMore) {
      btnSlidesHeightMore.addEventListener('click', () => {
        const cur = Number(sliderBottomHeight?.value || 148);
        setBottomNotesHeight(cur - 20, true);
      });
    }

    // Top Row Height Slider & Step Buttons
    if (sliderTopHeight) {
      sliderTopHeight.addEventListener('input', (e) => setTopBarHeight(e.target.value, false));
      sliderTopHeight.addEventListener('change', (e) => setTopBarHeight(e.target.value, true));
    }
    if (btnTopHeightLess) {
      btnTopHeightLess.addEventListener('click', () => {
        const cur = Number(sliderTopHeight?.value || 92);
        setTopBarHeight(cur - 10, true);
      });
    }
    if (btnTopHeightMore) {
      btnTopHeightMore.addEventListener('click', () => {
        const cur = Number(sliderTopHeight?.value || 92);
        setTopBarHeight(cur + 10, true);
      });
    }

    // Timer Width Slider & Step Buttons
    if (sliderTimerWidth) {
      sliderTimerWidth.addEventListener('input', (e) => setTimerWidth(e.target.value, false));
      sliderTimerWidth.addEventListener('change', (e) => setTimerWidth(e.target.value, true));
    }
    if (btnTimerWidthLess) {
      btnTimerWidthLess.addEventListener('click', () => {
        const cur = Number(sliderTimerWidth?.value || 33);
        setTimerWidth(cur - 5, true);
      });
    }
    if (btnTimerWidthMore) {
      btnTimerWidthMore.addEventListener('click', () => {
        const cur = Number(sliderTimerWidth?.value || 33);
        setTimerWidth(cur + 5, true);
      });
    }

    // Bottom Notes Height Slider & Step Buttons
    if (sliderBottomHeight) {
      sliderBottomHeight.addEventListener('input', (e) => setBottomNotesHeight(e.target.value, false));
      sliderBottomHeight.addEventListener('change', (e) => setBottomNotesHeight(e.target.value, true));
    }
    if (btnBottomHeightLess) {
      btnBottomHeightLess.addEventListener('click', () => {
        const cur = Number(sliderBottomHeight?.value || 148);
        setBottomNotesHeight(cur - 15, true);
      });
    }
    if (btnBottomHeightMore) {
      btnBottomHeightMore.addEventListener('click', () => {
        const cur = Number(sliderBottomHeight?.value || 148);
        setBottomNotesHeight(cur + 15, true);
      });
    }

    // Notes Width Slider & Step Buttons
    if (sliderNotesWidth) {
      sliderNotesWidth.addEventListener('input', (e) => setNotesWidth(e.target.value, false));
      sliderNotesWidth.addEventListener('change', (e) => setNotesWidth(e.target.value, true));
    }
    if (btnNotesWidthLess) {
      btnNotesWidthLess.addEventListener('click', () => {
        const cur = Number(sliderNotesWidth?.value || 67);
        setNotesWidth(cur - 5, true);
      });
    }
    if (btnNotesWidthMore) {
      btnNotesWidthMore.addEventListener('click', () => {
        const cur = Number(sliderNotesWidth?.value || 67);
        setNotesWidth(cur + 5, true);
      });
    }

    // Quick Presets
    if (presetSplitBalanced) {
      presetSplitBalanced.addEventListener('click', () => {
        setSlidesSplit(50, false);
        setTopBarHeight(92, false);
        setBottomNotesHeight(148, false);
        setTimerWidth(33, false);
        setNotesWidth(67, true);
      });
    }

    if (presetSplitCinema) {
      presetSplitCinema.addEventListener('click', () => {
        setSlidesSplit(70, false);
        setTopBarHeight(80, false);
        setBottomNotesHeight(120, false);
        setTimerWidth(30, false);
        setNotesWidth(70, true);
      });
    }

    if (presetSplitNotes) {
      presetSplitNotes.addEventListener('click', () => {
        setSlidesSplit(40, false);
        setTopBarHeight(80, false);
        setBottomNotesHeight(280, false);
        setTimerWidth(30, false);
        setNotesWidth(80, true);
      });
    }

    if (presetSplitTimer) {
      presetSplitTimer.addEventListener('click', () => {
        setSlidesSplit(50, false);
        setTopBarHeight(180, false);
        setBottomNotesHeight(110, false);
        setTimerWidth(60, false);
        setNotesWidth(67, true);
      });
    }

    if (presetSplitReset) {
      presetSplitReset.addEventListener('click', () => {
        resetDashboardLayout();
      });
    }

    // Close on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && confTabSizeDrawer && confTabSizeDrawer.style.display !== 'none') {
        closeTabSizeDrawer();
      }
    });

    syncDrawerControlsFromState();
  }

  initTabSizeDrawer();

  // =========================================================================
  // 3. HIGH-RESOLUTION SLIDE PREVIEW RENDERING (SIDE-BY-SIDE)
  // =========================================================================
  async function renderSlideToCanvas(pageNumber, canvas) {
    if (!canvas || pageNumber < 1 || pageNumber > totalPages) return;

    // Use PDFDocumentEngine if available for unified vector/demo rendering
    if (engine) {
      try {
        const container = canvas.parentElement;
        const targetW = container ? container.clientWidth || 640 : 640;
        const targetH = container ? container.clientHeight || 360 : 360;
        await engine.renderPageToCanvas(pageNumber, canvas, {
          targetWidth: targetW,
          targetHeight: targetH,
          scale: 2.0
        });
        return;
      } catch (err) {
        console.warn('[Confidence Engine Render Error]', err);
      }
    }

    // Direct PDF.js fallback
    if (pdfDoc) {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      } catch (err) {
        console.error('Error rendering confidence slide via PDF.js:', err);
      }
    }
  }

  async function updateSlides(page) {
    currentPage = Number(page || 1);
    if (confSlideCounter) {
      confSlideCounter.textContent = `Slide ${currentPage} of ${totalPages}`;
    }
    if (confCurrentSlideNum) {
      confCurrentSlideNum.textContent = `#${currentPage}`;
    }

    // Render Current Live Audience Slide
    await renderSlideToCanvas(currentPage, confCurrentCanvas);

    // Render Upcoming Next Slide Side-by-Side
    if (currentPage < totalPages) {
      if (confNextSlideNum) confNextSlideNum.textContent = `#${currentPage + 1}`;
      if (confNoNextMsg) confNoNextMsg.style.display = 'none';
      if (confNextCanvas) confNextCanvas.style.display = 'block';
      await renderSlideToCanvas(currentPage + 1, confNextCanvas);
    } else {
      if (confNextSlideNum) confNextSlideNum.textContent = 'END';
      if (confNextCanvas) confNextCanvas.style.display = 'none';
      if (confNoNextMsg) confNoNextMsg.style.display = 'flex';
    }

    // Update & Reset Teleprompter Notes
    updateNotes();
    if (confNotesViewport) {
      confNotesViewport.scrollTop = 0;
    }
  }

  function updateNotes() {
    if (!confNotesText) return;

    let note = currentNotes[currentPage];
    if (note === undefined && engine) {
      // Check localStorage for presenter custom notes or fallback to engine
      const docTitle = engine.documentTitle || 'Presentation.pdf';
      const saved = localStorage.getItem(`pdf_notes_${docTitle}_p${currentPage}`);
      note = saved !== null ? saved : (engine.getSpeakerNotes(currentPage) || '');
    }

    if (note && String(note).trim()) {
      confNotesText.textContent = String(note);
      confNotesText.style.fontStyle = 'normal';
      confNotesText.style.color = '#f8fafc';
    } else {
      confNotesText.textContent = 'No speaker notes for this slide.';
      confNotesText.style.fontStyle = 'italic';
      confNotesText.style.color = '#64748b';
    }
  }

  // =========================================================================
  // 4. GIANT TIMER TELEMETRY (CYAN / AMBER / RED / OVERTIME)
  // =========================================================================
  function updateTimerUI(data) {
    if (!confTimerDisplay || !data) return;

    confTimerDisplay.textContent = data.timerDisplay || data.formatted || '00:00';
    confTimerDisplay.className = 'conf-timer-display';

    let phase = data.timerPhase || data.phase || 'normal';
    if (phase === 'cyan') phase = 'normal';
    confTimerDisplay.classList.add(`phase-${phase}`);
  }

  // =========================================================================
  // 5. ANIMATED SILENT STAGE CUE BANNER (TECH -> SPEAKER)
  // =========================================================================
  let stageCueTimeout = null;
  function handleStageCue(message, duration = 10000) {
    if (!confStageCueBanner || !confStageCueText) return;

    if (stageCueTimeout) {
      clearTimeout(stageCueTimeout);
      stageCueTimeout = null;
    }

    if (!message || !String(message).trim()) {
      confStageCueBanner.style.display = 'none';
      return;
    }

    confStageCueText.textContent = String(message).toUpperCase();
    confStageCueBanner.style.display = 'flex';

    if (duration > 0) {
      stageCueTimeout = setTimeout(() => {
        confStageCueBanner.style.display = 'none';
      }, duration);
    }
  }

  // =========================================================================
  // 6. SYNC BUS & ELECTRON IPC SYNCHRONIZATION
  // =========================================================================
  const syncBus = window.PresentationSyncBus ? new window.PresentationSyncBus('confidence') : null;

  function handleIncomingSync(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'SYNC_STATE':
        if (data.currentPage) currentPage = Number(data.currentPage);
        if (data.totalPages) totalPages = Number(data.totalPages);
        if (data.notes) currentNotes = data.notes;
        if (data.timer) updateTimerUI(data.timer);
        updateSlides(currentPage);
        break;

      case 'PAGE_CHANGED':
      case 'GOTO_PAGE':
        if (data.page) updateSlides(data.page);
        break;

      case 'TIMER_TICK':
        updateTimerUI(data);
        break;

      case 'UPDATE_NOTES':
        if (data.notes) {
          currentNotes = data.notes;
          updateNotes();
        } else if (data.currentPage && data.currentNote !== undefined) {
          currentNotes[data.currentPage] = data.currentNote;
          if (data.currentPage === currentPage) updateNotes();
        }
        break;

      case 'STAGE_CUE':
        handleStageCue(data.message, data.duration);
        break;

      case 'CLEAR_STAGE_CUE':
        handleStageCue(null);
        break;

      case 'LOAD_DOCUMENT':
        if (data.isDemo) {
          loadDemoDeck();
        } else if (data.pdfData || data.streamUrl) {
          loadDocumentData(data.pdfData, data.streamUrl, data.title);
        }
        break;
    }
  }

  if (syncBus) {
    syncBus.on('SYNC_STATE', handleIncomingSync);
    syncBus.on('PAGE_CHANGED', handleIncomingSync);
    syncBus.on('GOTO_PAGE', handleIncomingSync);
    syncBus.on('TIMER_TICK', handleIncomingSync);
    syncBus.on('UPDATE_NOTES', handleIncomingSync);
    syncBus.on('STAGE_CUE', handleIncomingSync);
    syncBus.on('CLEAR_STAGE_CUE', handleIncomingSync);
    syncBus.on('LOAD_DOCUMENT', handleIncomingSync);
  }

  if (window.electronAPI && window.electronAPI.onSync) {
    window.electronAPI.onSync(handleIncomingSync);
  }

  // Window resize handler for crisp canvas previews
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateSlides(currentPage);
    }, 150);
  });

  // =========================================================================
  // 7. INITIAL DOCUMENT LOADING
  // =========================================================================
  async function loadDemoDeck() {
    if (engine) {
      const info = await engine.loadDemo();
      totalPages = info.totalPages;
      currentPage = 1;
      await updateSlides(1);
    }
  }

  async function loadDocumentData(pdfData, streamUrl, title) {
    if (engine) {
      try {
        let info;
        if (pdfData) {
          info = await engine.loadPDFData(pdfData, title);
        } else if (streamUrl) {
          info = await engine.loadPDFFromUrl(streamUrl, title);
        } else {
          info = await engine.loadDemo();
        }
        totalPages = info.totalPages;
        await updateSlides(currentPage);
      } catch (err) {
        console.warn('Error loading PDF document in confidence monitor:', err);
        await loadDemoDeck();
      }
    }
  }

  async function initConfidenceMonitor() {
    if (window.electronAPI && window.electronAPI.getPresentationData) {
      try {
        const data = await window.electronAPI.getPresentationData();
        if (data && data.config) {
          totalPages = data.config.totalPages || 6;
          if (data.state) {
            currentPage = data.state.currentPage || 1;
            if (data.state.timerFormatted) {
              updateTimerUI({ timerDisplay: data.state.timerFormatted, timerPhase: 'normal' });
            }
          }
          if (data.config.isDemo || (!data.pdfData && !data.streamUrl)) {
            await loadDemoDeck();
          } else {
            await loadDocumentData(data.pdfData, data.streamUrl, data.config.title);
          }
          await updateSlides(currentPage);
          return;
        }
      } catch (e) {
        console.warn('[Confidence Init Data Error]', e);
      }
    }

    // Default: Load built-in keynote presentation deck
    await loadDemoDeck();
  }

  // Load PDF Document Externally
  window.loadConfidenceDocument = async function(pdfData, initialPage = 1, notes = {}) {
    currentNotes = notes || {};
    if (engine) {
      try {
        const info = await engine.loadPDFData(pdfData, 'Presentation.pdf');
        totalPages = info.totalPages;
        await updateSlides(initialPage);
      } catch (e) {
        console.error('Error loading confidence document:', e);
      }
    }
  };

  // Expose Stage Cue & Monitor API on window
  window.ConfidenceMonitor = {
    setStageCue: handleStageCue,
    updateTimer: updateTimerUI,
    updateSlides: updateSlides,
    toggleAutoScroll: toggleAutoScroll,
    applyLayout: applyLayout,
    setPreset: setPreset,
    getLayout: () => ({ ...currentLayout }),
    getDashboardState: () => JSON.parse(JSON.stringify(dashboardState)),
    resetDashboardLayout: resetDashboardLayout,
    toggleDashboardLock: toggleDashboardLock,
    setWindowVisibility: setWindowVisibility,
    initWindowResizers: initWindowResizers,
    openTabSizeEditor: openTabSizeDrawer,
    closeTabSizeEditor: closeTabSizeDrawer,
    toggleTabSizeEditor: toggleTabSizeDrawer,
    setSlidesSplit: setSlidesSplit,
    setTopBarHeight: setTopBarHeight,
    setBottomNotesHeight: setBottomNotesHeight,
    setTimerWidth: setTimerWidth,
    setNotesWidth: setNotesWidth,
    syncDrawerControls: syncDrawerControlsFromState,
    loadConfidenceDocument: window.loadConfidenceDocument
  };

  // Boot up
  initConfidenceMonitor();

})();
