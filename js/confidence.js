/**
 * js/confidence.js
 * Stage Floor Confidence Monitor & Teleprompter Controller
 * Professional Pro Studio Matrix for Broadcast Keynotes, AV Teams & Speakers
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
  const confContainer = document.getElementById('confContainer');
  const confTopBar = document.getElementById('confTopBar');
  const confDashboardGrid = document.getElementById('confDashboardGrid');
  const confMainContent = document.getElementById('confMainContent');
  const confSlidesSection = document.getElementById('confSlidesSection');
  const confNotesSection = document.getElementById('confNotesSection');
  const confResizerH = document.getElementById('confResizerH');
  const confResizerV = document.getElementById('confResizerV');

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
  const confCueIdleMsg = document.getElementById('confCueIdleMsg');

  // Presets & Controls
  const btnPresetBalanced = document.getElementById('btnPresetBalanced');
  const btnPresetNotes = document.getElementById('btnPresetNotes');
  const btnPresetTimer = document.getElementById('btnPresetTimer');
  const btnPresetSlides = document.getElementById('btnPresetSlides');
  const btnPresetCockpit = document.getElementById('btnPresetCockpit');

  const btnScaleDown = document.getElementById('btnScaleDown');
  const btnScaleReset = document.getElementById('btnScaleReset');
  const btnScaleUp = document.getElementById('btnScaleUp');

  const btnWidgetsMenu = document.getElementById('btnWidgetsMenu');
  const confWidgetsDropdown = document.getElementById('confWidgetsDropdown');
  const btnEditTabSizes = document.getElementById('btnEditTabSizes');
  const btnLockDashboard = document.getElementById('btnLockDashboard');
  const btnResetLayout = document.getElementById('btnResetLayout');
  const btnFullscreenConf = document.getElementById('btnFullscreenConf');

  const confTabSizeDrawer = document.getElementById('confTabSizeDrawer');
  const btnCloseTabSizeDrawer = document.getElementById('btnCloseTabSizeDrawer');

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
    if (!confTopBar) return;
    confTopBar.classList.remove('hud-dimmed');
    if (hudDimTimeout) {
      clearTimeout(hudDimTimeout);
      hudDimTimeout = null;
    }
    // Auto-dim after 3.5 seconds of inactivity in non-edit mode
    if (confContainer && !confContainer.classList.contains('studio-edit-mode')) {
      hudDimTimeout = setTimeout(() => {
        if (confTopBar && (!confWidgetsDropdown || confWidgetsDropdown.style.display === 'none') &&
            (!confTabSizeDrawer || confTabSizeDrawer.style.display === 'none')) {
          confTopBar.classList.add('hud-dimmed');
        }
      }, 3500);
    }
  }

  window.addEventListener('mousemove', resetHudDimmer);
  window.addEventListener('mousedown', resetHudDimmer);
  window.addEventListener('keydown', resetHudDimmer);
  resetHudDimmer();

  if (btnFullscreenConf) {
    btnFullscreenConf.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        btnFullscreenConf.textContent = '✕ Exit Fullscreen';
      } else {
        document.exitFullscreen().catch(() => {});
        btnFullscreenConf.textContent = '⤢ Fullscreen';
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        btnFullscreenConf.textContent = '✕ Exit Fullscreen';
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
        const px = (autoScrollSpeed * 35 * delta) / 1000;
        confNotesViewport.scrollTop += px;

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
    if (e.target && e.target.matches('input, textarea, select')) return;

    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      toggleAutoScroll();
    } else if (e.key === '+' || e.key === '=') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        applyStageScale(currentScale + 0.1);
      } else if (btnFontIncrease) {
        btnFontIncrease.click();
      }
    } else if (e.key === '-' || e.key === '_') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        applyStageScale(currentScale - 0.1);
      } else if (btnFontDecrease) {
        btnFontDecrease.click();
      }
    } else if ((e.key === '0') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      applyStageScale(1.0);
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      if (currentPage < totalPages) navigateSlide(currentPage + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (currentPage > 1) navigateSlide(currentPage - 1);
    }
  });

  function navigateSlide(targetPage) {
    updateSlides(targetPage);
    if (typeof syncBus !== 'undefined' && syncBus && syncBus.send) {
      syncBus.send({ type: 'GOTO_PAGE', page: targetPage });
    }
    if (window.electronAPI && window.electronAPI.sendSync) {
      window.electronAPI.sendSync({ type: 'GOTO_PAGE', page: targetPage });
    }
  }

  // =========================================================================
  // 3. LAYOUT RESIZING & PRESETS CONTROLLER
  // =========================================================================
  const STORAGE_KEY_LAYOUT = 'pdf_presenter_confidence_layout';

  let currentLayout = {
    topHeight: 92,
    slidesWidthPercent: 50,
    timerFontSize: 52,
    activePreset: 'balanced'
  };

  function applyLayout(layout, save = true) {
    if (!layout) return;
    currentLayout = { ...currentLayout, ...layout };

    if (confTopBar) {
      confTopBar.style.height = typeof currentLayout.topHeight === 'number' ? `${currentLayout.topHeight}px` : currentLayout.topHeight;
    }

    if (confDashboardGrid) {
      const topHStr = typeof currentLayout.topHeight === 'number' ? `${currentLayout.topHeight}px` : currentLayout.topHeight;
      confDashboardGrid.style.setProperty('--conf-row-top-h', topHStr);
      confDashboardGrid.style.setProperty('--conf-timer-font-size', `${currentLayout.timerFontSize}px`);
    }

    if (confTimerDisplay) {
      confTimerDisplay.style.fontSize = `${currentLayout.timerFontSize}px`;
    }

    if (confSlidesSection) {
      confSlidesSection.style.width = `${currentLayout.slidesWidthPercent}%`;
    }

    if (confDashboardGrid && currentLayout.slidesWidthPercent) {
      const curWin = document.getElementById('dockWindowCurrent');
      const nextWin = document.getElementById('dockWindowNext');
      if (curWin && nextWin) {
        const curPct = Math.max(15, Math.min(85, currentLayout.slidesWidthPercent));
        const spanCur = Math.max(15, Math.min(105, Math.round((curPct / 100) * 120)));
        const spanNext = 120 - spanCur;
        curWin.style.gridColumn = `span ${spanCur}`;
        nextWin.style.gridColumn = `span ${spanNext}`;
      }
    }

    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(currentLayout));
      } catch (e) {}
    }

    if (typeof updateSlides === 'function') {
      updateSlides(currentPage);
    }
  }

  function setPreset(presetName) {
    const presets = {
      balanced: { topHeight: 92, slidesWidthPercent: 50, timerFontSize: 52, activePreset: 'balanced' },
      slides: { topHeight: 70, slidesWidthPercent: 80, timerFontSize: 38, activePreset: 'slides' },
      notes: { topHeight: 70, slidesWidthPercent: 35, timerFontSize: 38, activePreset: 'notes' },
      timer: { topHeight: 180, slidesWidthPercent: 50, timerFontSize: 92, activePreset: 'timer' }
    };

    const target = presets[presetName] || presets.balanced;
    applyLayout(target);

    document.querySelectorAll('.btn-conf-preset').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btnPreset${presetName.charAt(0).toUpperCase() + presetName.slice(1)}`);
    if (btn) btn.classList.add('active');
  }

  // Load stored layout
  try {
    const savedLayout = localStorage.getItem(STORAGE_KEY_LAYOUT);
    if (savedLayout) {
      applyLayout(JSON.parse(savedLayout), false);
    }
  } catch (e) {}

  // =========================================================================
  // 4. DISPLAY SCALE CONTROLLER
  // =========================================================================
  const STORAGE_KEY_SCALE = 'pdf_presenter_confidence_scale';
  let currentScale = 1.0;

  function applyStageScale(scale, save = true) {
    currentScale = Math.max(0.6, Math.min(2.2, Math.round(scale * 100) / 100));
    document.documentElement.style.setProperty('--conf-scale', currentScale);

    if (btnScaleReset) {
      btnScaleReset.textContent = `${Math.round(currentScale * 100)}%`;
    }

    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY_SCALE, String(currentScale));
      } catch (e) {}
    }

    if (typeof updateSlides === 'function') {
      updateSlides(currentPage);
    }
  }

  try {
    const savedScale = localStorage.getItem(STORAGE_KEY_SCALE);
    if (savedScale) {
      applyStageScale(parseFloat(savedScale), false);
    }
  } catch (e) {}

  if (btnScaleDown) btnScaleDown.addEventListener('click', () => applyStageScale(currentScale - 0.1));
  if (btnScaleReset) btnScaleReset.addEventListener('click', () => applyStageScale(1.0));
  if (btnScaleUp) btnScaleUp.addEventListener('click', () => applyStageScale(currentScale + 0.1));

  // =========================================================================
  // 5. DASHBOARD GRID, WINDOWS, DOCKING & RESIZERS
  // =========================================================================
  const STORAGE_KEY_DASHBOARD = 'pdf_presenter_confidence_dashboard_layout';
  let dashboardLocked = false;
  let maximizedWindowId = null;

  let dashboardState = {
    order: ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'],
    hidden: [],
    collapsed: [],
    spans: {
      timer: 'span-1',
      clock: 'span-1',
      counter: 'span-1',
      current: 'span-2',
      next: 'span-2',
      notes: 'span-2',
      cue: 'span-full'
    },
    rowSpans: {
      timer: 'row-span-1',
      clock: 'row-span-1',
      counter: 'row-span-1',
      current: 'row-span-1',
      next: 'row-span-1',
      notes: 'row-span-1',
      cue: 'row-span-1'
    },
    flexibleSpans: {},
    flexibleRows: {},
    activePreset: 'balanced'
  };

  function loadDashboardState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DASHBOARD);
      if (raw) {
        const parsed = JSON.parse(raw);
        dashboardState = { ...dashboardState, ...parsed };
      }
    } catch (e) {}
    renderDashboardOrder();
    syncWidgetCheckboxes();
  }

  function saveDashboardState() {
    try {
      localStorage.setItem(STORAGE_KEY_DASHBOARD, JSON.stringify(dashboardState));
    } catch (e) {}
  }

  function getDockWindowEl(windowId) {
    const idMap = {
      timer: 'dockWindowTimer',
      clock: 'dockWindowClock',
      counter: 'dockWindowCounter',
      current: 'dockWindowCurrent',
      next: 'dockWindowNext',
      notes: 'dockWindowNotes',
      cue: 'dockWindowCue'
    };
    return document.getElementById(idMap[windowId]);
  }

  function renderDashboardOrder() {
    if (!confDashboardGrid) return;

    dashboardState.order.forEach(wid => {
      const el = getDockWindowEl(wid);
      if (el) {
        confDashboardGrid.appendChild(el);

        // Apply Spans
        el.className = el.className.replace(/\bspan-\S+/g, '').trim();
        const spanClass = dashboardState.spans[wid] || 'span-1';
        el.classList.add(spanClass);

        // Apply Row Spans
        el.className = el.className.replace(/\brow-span-\S+/g, '').trim();
        const rowSpanClass = dashboardState.rowSpans[wid] || 'row-span-1';
        el.classList.add(rowSpanClass);

        // Hidden & Collapsed
        el.style.display = dashboardState.hidden.includes(wid) ? 'none' : 'flex';
        el.classList.toggle('is-collapsed', dashboardState.collapsed.includes(wid));

        // Flexible spans
        if (dashboardState.flexibleSpans[wid]) {
          el.style.gridColumn = `span ${dashboardState.flexibleSpans[wid]}`;
        }
      }
    });

    adjustGridForActiveWindows();
  }

  function adjustGridForActiveWindows() {
    const isCurrent = !dashboardState.hidden.includes('current');
    const isNext = !dashboardState.hidden.includes('next');
    const curEl = getDockWindowEl('current');
    if (curEl) {
      if (isCurrent && !isNext) {
        curEl.style.gridColumn = 'span 120';
      } else if (!dashboardState.flexibleSpans['current']) {
        curEl.style.gridColumn = '';
      }
    }
  }

  function toggleDashboardLock() {
    dashboardLocked = !dashboardLocked;
    if (confDashboardGrid) {
      confDashboardGrid.classList.toggle('dashboard-locked', dashboardLocked);
    }
    if (btnLockDashboard) {
      btnLockDashboard.textContent = dashboardLocked ? '🔒 Locked' : '🔓 Unlock';
    }
  }

  function resetDashboardLayout() {
    dashboardState = {
      order: ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'],
      hidden: [],
      collapsed: [],
      spans: {
        timer: 'span-1',
        clock: 'span-1',
        counter: 'span-1',
        current: 'span-2',
        next: 'span-2',
        notes: 'span-2',
        cue: 'span-full'
      },
      rowSpans: {
        timer: 'row-span-1',
        clock: 'row-span-1',
        counter: 'row-span-1',
        current: 'row-span-1',
        next: 'row-span-1',
        notes: 'row-span-1',
        cue: 'row-span-1'
      },
      flexibleSpans: {},
      flexibleRows: {},
      activePreset: 'balanced'
    };
    saveDashboardState();
    renderDashboardOrder();
    syncWidgetCheckboxes();
    setPreset('balanced');
  }

  function applyDockPreset(presetName) {
    if (!confContainer) return;

    if (presetName === 'cockpit' || presetName === 'edit') {
      confContainer.classList.add('studio-edit-mode');
      confContainer.classList.remove('mode-seamless');
      if (confTopBar) confTopBar.classList.remove('hud-dimmed');
    } else {
      confContainer.classList.remove('studio-edit-mode');
      confContainer.classList.add('mode-seamless');
      resetHudDimmer();
    }

    if (presetName === 'balanced') {
      setPreset('balanced');
    } else if (presetName === 'notes') {
      setPreset('notes');
    } else if (presetName === 'timer') {
      setPreset('timer');
    } else if (presetName === 'slides') {
      setPreset('slides');
    }
  }

  // Preset button clicks
  if (btnPresetBalanced) btnPresetBalanced.addEventListener('click', () => applyDockPreset('balanced'));
  if (btnPresetNotes) btnPresetNotes.addEventListener('click', () => applyDockPreset('notes'));
  if (btnPresetTimer) btnPresetTimer.addEventListener('click', () => applyDockPreset('timer'));
  if (btnPresetSlides) btnPresetSlides.addEventListener('click', () => applyDockPreset('slides'));
  if (btnPresetCockpit) btnPresetCockpit.addEventListener('click', () => applyDockPreset('cockpit'));

  if (btnLockDashboard) btnLockDashboard.addEventListener('click', toggleDashboardLock);
  if (btnResetLayout) btnResetLayout.addEventListener('click', resetDashboardLayout);

  // Drag and Drop reordering
  let draggedWindowEl = null;

  document.querySelectorAll('.conf-dock-window').forEach(win => {
    win.addEventListener('dragstart', (e) => {
      if (dashboardLocked || e.target.closest('.conf-dock-resizer') || e.target.closest('.conf-window-hud')) {
        e.preventDefault();
        return;
      }
      draggedWindowEl = win;
      win.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', win.dataset.windowId || '');
    });

    win.addEventListener('dragover', (e) => {
      if (dashboardLocked || !draggedWindowEl || draggedWindowEl === win) return;
      e.preventDefault();
      const rect = win.getBoundingClientRect();
      const isBefore = (e.clientX - rect.left) < (rect.width / 2);
      win.classList.toggle('drop-target-before', isBefore);
      win.classList.toggle('drop-target-after', !isBefore);
    });

    win.addEventListener('dragleave', () => {
      win.classList.remove('drop-target-before', 'drop-target-after');
    });

    win.addEventListener('drop', (e) => {
      e.preventDefault();
      win.classList.remove('drop-target-before', 'drop-target-after');
      if (dashboardLocked || !draggedWindowEl || draggedWindowEl === win) return;

      const rect = win.getBoundingClientRect();
      const isBefore = (e.clientX - rect.left) < (rect.width / 2);

      const srcId = draggedWindowEl.dataset.windowId;
      const targetId = win.dataset.windowId;

      const srcIdx = dashboardState.order.indexOf(srcId);
      if (srcIdx >= 0) dashboardState.order.splice(srcIdx, 1);

      const targetIdx = dashboardState.order.indexOf(targetId);
      dashboardState.order.splice(isBefore ? targetIdx : targetIdx + 1, 0, srcId);

      saveDashboardState();
      renderDashboardOrder();
    });

    win.addEventListener('dragend', () => {
      if (draggedWindowEl) {
        draggedWindowEl.classList.remove('is-dragging');
        draggedWindowEl = null;
      }
      document.querySelectorAll('.conf-dock-window').forEach(w => w.classList.remove('drop-target-before', 'drop-target-after'));
    });
  });

  // Window Sizing & HUD Functions
  function cycleWindowWidth(windowId) {
    const spans = ['span-1', 'span-2', 'span-3', 'span-full'];
    const cur = dashboardState.spans[windowId] || 'span-1';
    const next = spans[(spans.indexOf(cur) + 1) % spans.length];
    dashboardState.spans[windowId] = next;
    delete dashboardState.flexibleSpans[windowId];
    saveDashboardState();
    renderDashboardOrder();
  }

  function cycleWindowHeight(windowId) {
    const rowSpans = ['row-span-1', 'row-span-2', 'row-span-full'];
    const cur = dashboardState.rowSpans[windowId] || 'row-span-1';
    const next = rowSpans[(rowSpans.indexOf(cur) + 1) % rowSpans.length];
    setWindowRowSpan(windowId, next);
  }

  function setWindowRowSpan(windowId, rowSpanClass) {
    dashboardState.rowSpans[windowId] = rowSpanClass;
    saveDashboardState();
    renderDashboardOrder();
  }

  function toggleWindowMaximize(windowId) {
    const el = getDockWindowEl(windowId);
    if (!el) return;

    if (maximizedWindowId === windowId) {
      el.classList.remove('is-maximized');
      maximizedWindowId = null;
    } else {
      document.querySelectorAll('.conf-dock-window').forEach(w => w.classList.remove('is-maximized'));
      el.classList.add('is-maximized');
      maximizedWindowId = windowId;
    }
  }

  function setWindowVisibility(windowId, visible) {
    if (visible) {
      dashboardState.hidden = dashboardState.hidden.filter(id => id !== windowId);
    } else {
      if (!dashboardState.hidden.includes(windowId)) {
        dashboardState.hidden.push(windowId);
      }
    }
    saveDashboardState();
    renderDashboardOrder();
    syncWidgetCheckboxes();
  }

  function syncWidgetCheckboxes() {
    const windows = ['timer', 'clock', 'counter', 'current', 'next', 'notes', 'cue'];
    windows.forEach(wid => {
      const cap = wid.charAt(0).toUpperCase() + wid.slice(1);
      const chk = document.getElementById(`chkWin${cap}`);
      if (chk) {
        chk.checked = !dashboardState.hidden.includes(wid);
      }
      const item = document.querySelector(`.widget-toggle-item[data-window-id="${wid}"]`);
      if (item) {
        const badge = item.querySelector('.widget-toggle-badge');
        const isVis = !dashboardState.hidden.includes(wid);
        item.classList.toggle('is-hidden', !isVis);
        if (badge) badge.textContent = isVis ? 'ON' : 'OFF';
      }
    });
  }

  // Wire Window action buttons
  document.querySelectorAll('.conf-dock-window').forEach(win => {
    const wid = win.dataset.windowId;

    // Header buttons
    const btnCollapse = win.querySelector('.btn-dock-collapse');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        const idx = dashboardState.collapsed.indexOf(wid);
        if (idx >= 0) dashboardState.collapsed.splice(idx, 1);
        else dashboardState.collapsed.push(wid);
        saveDashboardState();
        renderDashboardOrder();
      });
    }

    const btnSpan = win.querySelector('.btn-dock-span');
    if (btnSpan) btnSpan.addEventListener('click', () => cycleWindowWidth(wid));

    const btnHeight = win.querySelector('.btn-dock-height');
    if (btnHeight) btnHeight.addEventListener('click', () => cycleWindowHeight(wid));

    const btnMax = win.querySelector('.btn-dock-max');
    if (btnMax) btnMax.addEventListener('click', () => toggleWindowMaximize(wid));

    const btnClose = win.querySelector('.btn-dock-close');
    if (btnClose) btnClose.addEventListener('click', () => setWindowVisibility(wid, false));

    const btnEditor = win.querySelector('.btn-dock-editor');
    if (btnEditor) btnEditor.addEventListener('click', () => openTabSizeDrawer());

    // Floating HUD buttons
    const btnHudWidth = win.querySelector('.btn-hud-width');
    if (btnHudWidth) btnHudWidth.addEventListener('click', () => cycleWindowWidth(wid));

    const btnHudHeight = win.querySelector('.btn-hud-height');
    if (btnHudHeight) btnHudHeight.addEventListener('click', () => cycleWindowHeight(wid));

    const btnHudMax = win.querySelector('.btn-hud-max');
    if (btnHudMax) btnHudMax.addEventListener('click', () => toggleWindowMaximize(wid));

    const btnHudEditor = win.querySelector('.btn-hud-editor');
    if (btnHudEditor) btnHudEditor.addEventListener('click', () => openTabSizeDrawer());

    // Double click header to maximize
    const header = win.querySelector('.conf-dock-header');
    if (header) {
      header.addEventListener('dblclick', () => toggleWindowMaximize(wid));
    }
  });

  // Widget dropdown toggle
  if (btnWidgetsMenu && confWidgetsDropdown) {
    btnWidgetsMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      confWidgetsDropdown.style.display = confWidgetsDropdown.style.display === 'none' ? 'flex' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!confWidgetsDropdown.contains(e.target) && e.target !== btnWidgetsMenu) {
        confWidgetsDropdown.style.display = 'none';
      }
    });

    document.querySelectorAll('.widget-toggle-item').forEach(item => {
      const wid = item.dataset.windowId;
      const toggleAction = () => {
        const isHidden = dashboardState.hidden.includes(wid);
        setWindowVisibility(wid, isHidden);
      };

      item.addEventListener('click', toggleAction);
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleAction();
        }
      });
    });
  }

  // =========================================================================
  // 6. CONTINUOUS WINDOW RESIZERS & TAB SIZE DRAWER
  // =========================================================================
  function initWindowResizers() {
    document.querySelectorAll('.conf-dock-resizer').forEach(resizer => {
      resizer.addEventListener('pointerdown', (e) => {
        if (dashboardLocked) return;
        e.preventDefault();
        e.stopPropagation();
        resizer.setPointerCapture(e.pointerId);

        const win = resizer.closest('.conf-dock-window');
        const wid = win.dataset.windowId;
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = win.offsetWidth;
        const startH = win.offsetHeight;
        const gridW = confDashboardGrid.offsetWidth || 1200;

        const isRight = resizer.classList.contains('conf-dock-resizer-r');
        const isBottom = resizer.classList.contains('conf-dock-resizer-b');
        const isCorner = resizer.classList.contains('conf-dock-resizer-se');

        if (isRight) document.body.classList.add('conf-resizing-col');
        if (isBottom) document.body.classList.add('conf-resizing-row');
        if (isCorner) document.body.classList.add('conf-resizing-se');

        function onPointerMove(ev) {
          if (isRight || isCorner) {
            const deltaX = ev.clientX - startX;
            const newW = Math.max(80, startW + deltaX);
            const span = Math.max(15, Math.min(105, Math.round((newW / gridW) * 120)));
            win.style.gridColumn = `span ${span}`;
            dashboardState.flexibleSpans[wid] = span;
          }
          if (isBottom || isCorner) {
            const deltaY = ev.clientY - startY;
            const newH = Math.max(60, startH + deltaY);
            win.style.height = `${newH}px`;
            dashboardState.flexibleRows[wid] = newH;
          }
        }

        function onPointerUp(ev) {
          resizer.releasePointerCapture(ev.pointerId);
          document.body.classList.remove('conf-resizing-col', 'conf-resizing-row', 'conf-resizing-se');
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          saveDashboardState();
          if (typeof updateSlides === 'function') updateSlides(currentPage);
        }

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });

      resizer.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const win = resizer.closest('.conf-dock-window');
        const wid = win.dataset.windowId;
        win.style.gridColumn = '';
        win.style.height = '';
        delete dashboardState.flexibleSpans[wid];
        delete dashboardState.flexibleRows[wid];
        saveDashboardState();
        renderDashboardOrder();
      });
    });
  }

  initWindowResizers();

  // Unified Horizontal Splitter (#confResizerH)
  if (confResizerH) {
    confResizerH.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      confResizerH.setPointerCapture(e.pointerId);
      document.body.classList.add('conf-resizing-row');

      const startY = e.clientY;
      const gridH = confDashboardGrid ? confDashboardGrid.offsetHeight : 800;

      function onHMove(ev) {
        const bottomH = Math.max(70, Math.min(Math.round(gridH * 0.65), gridH - ev.clientY + 40));
        setBottomNotesHeight(bottomH);
      }

      function onHUp(ev) {
        confResizerH.releasePointerCapture(ev.pointerId);
        document.body.classList.remove('conf-resizing-row');
        window.removeEventListener('pointermove', onHMove);
        window.removeEventListener('pointerup', onHUp);
      }

      window.addEventListener('pointermove', onHMove);
      window.addEventListener('pointerup', onHUp);
    });

    confResizerH.addEventListener('dblclick', () => {
      setBottomNotesHeight(148);
    });
  }

  // Unified Vertical Splitter (#confResizerV)
  if (confResizerV) {
    confResizerV.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      confResizerV.setPointerCapture(e.pointerId);
      document.body.classList.add('conf-resizing-col');

      const gridW = confDashboardGrid ? confDashboardGrid.offsetWidth : 1200;

      function onVMove(ev) {
        const curPct = Math.max(15, Math.min(85, Math.round((ev.clientX / gridW) * 100)));
        setSlidesSplit(curPct);
      }

      function onVUp(ev) {
        confResizerV.releasePointerCapture(ev.pointerId);
        document.body.classList.remove('conf-resizing-col');
        window.removeEventListener('pointermove', onVMove);
        window.removeEventListener('pointerup', onVUp);
      }

      window.addEventListener('pointermove', onVMove);
      window.addEventListener('pointerup', onVUp);
    });

    confResizerV.addEventListener('dblclick', () => {
      setSlidesSplit(50);
    });
  }

  // Tab Size Drawer Controller
  function initTabSizeDrawer() {
    if (btnEditTabSizes && confTabSizeDrawer) {
      btnEditTabSizes.addEventListener('click', toggleTabSizeDrawer);
    }
    if (btnCloseTabSizeDrawer) {
      btnCloseTabSizeDrawer.addEventListener('click', closeTabSizeDrawer);
    }

    // Sliders
    const sSplit = document.getElementById('sliderSlidesSplit');
    if (sSplit) sSplit.addEventListener('input', (e) => setSlidesSplit(Number(e.target.value)));

    const sTopH = document.getElementById('sliderTopHeight');
    if (sTopH) sTopH.addEventListener('input', (e) => setTopBarHeight(Number(e.target.value)));

    const sBotH = document.getElementById('sliderBottomHeight');
    if (sBotH) sBotH.addEventListener('input', (e) => setBottomNotesHeight(Number(e.target.value)));

    const sTimerW = document.getElementById('sliderTimerWidth');
    if (sTimerW) sTimerW.addEventListener('input', (e) => setTimerWidth(Number(e.target.value)));

    const sNotesW = document.getElementById('sliderNotesWidth');
    if (sNotesW) sNotesW.addEventListener('input', (e) => setNotesWidth(Number(e.target.value)));

    // Step buttons
    const wireStep = (id, fn, delta) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => fn(delta));
    };

    wireStep('btnSlideCurrentLess', (d) => setSlidesSplit((currentLayout.slidesWidthPercent || 50) + d), -5);
    wireStep('btnSlideCurrentMore', (d) => setSlidesSplit((currentLayout.slidesWidthPercent || 50) + d), 5);
    wireStep('btnTopHeightLess', (d) => setTopBarHeight((currentLayout.topHeight || 92) + d), -10);
    wireStep('btnTopHeightMore', (d) => setTopBarHeight((currentLayout.topHeight || 92) + d), 10);
    wireStep('btnBottomHeightLess', (d) => setBottomNotesHeight(148 + d), -15);
    wireStep('btnBottomHeightMore', (d) => setBottomNotesHeight(148 + d), 15);
    wireStep('btnTimerWidthLess', (d) => setTimerWidth(33 + d), -5);
    wireStep('btnTimerWidthMore', (d) => setTimerWidth(33 + d), 5);
    wireStep('btnNotesWidthLess', (d) => setNotesWidth(67 + d), -5);
    wireStep('btnNotesWidthMore', (d) => setNotesWidth(67 + d), 5);

    // Presets
    const wirePreset = (id, p) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => {
        if (p === 'reset') resetDashboardLayout();
        else setPreset(p);
      });
    };
    wirePreset('presetSplitBalanced', 'balanced');
    wirePreset('presetSplitCinema', 'slides');
    wirePreset('presetSplitNotes', 'notes');
    wirePreset('presetSplitTimer', 'timer');
    wirePreset('presetSplitReset', 'reset');

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && confTabSizeDrawer && confTabSizeDrawer.style.display !== 'none') {
        closeTabSizeDrawer();
      }
    });

    syncDrawerControlsFromState();
  }

  function openTabSizeDrawer() {
    if (confTabSizeDrawer) {
      confTabSizeDrawer.style.display = 'flex';
      syncDrawerControlsFromState();
    }
  }

  function closeTabSizeDrawer() {
    if (confTabSizeDrawer) {
      confTabSizeDrawer.style.display = 'none';
    }
  }

  function toggleTabSizeDrawer() {
    if (confTabSizeDrawer) {
      if (confTabSizeDrawer.style.display === 'none') openTabSizeDrawer();
      else closeTabSizeDrawer();
    }
  }

  function setSlidesSplit(percent) {
    const val = Math.max(15, Math.min(85, Math.round(percent)));
    currentLayout.slidesWidthPercent = val;
    applyLayout(currentLayout);
    syncDrawerControlsFromState();
  }

  function setTopBarHeight(heightPx) {
    const val = Math.max(60, Math.min(260, Math.round(heightPx)));
    currentLayout.topHeight = val;
    applyLayout(currentLayout);
    syncDrawerControlsFromState();
  }

  function setBottomNotesHeight(heightPx) {
    const val = Math.max(60, Math.min(450, Math.round(heightPx)));
    if (confDashboardGrid) {
      confDashboardGrid.style.setProperty('--conf-row-bottom-h', `${val}px`);
    }
    syncDrawerControlsFromState();
  }

  function setTimerWidth(percent) {
    const val = Math.max(20, Math.min(80, Math.round(percent)));
    const span = Math.round((val / 100) * 120);
    const win = getDockWindowEl('timer');
    if (win) {
      win.style.gridColumn = `span ${span}`;
      dashboardState.flexibleSpans['timer'] = span;
      saveDashboardState();
    }
    syncDrawerControlsFromState();
  }

  function setNotesWidth(percent) {
    const val = Math.max(25, Math.min(100, Math.round(percent)));
    const span = Math.round((val / 100) * 120);
    const win = getDockWindowEl('notes');
    if (win) {
      win.style.gridColumn = `span ${span}`;
      dashboardState.flexibleSpans['notes'] = span;
      saveDashboardState();
    }
    syncDrawerControlsFromState();
  }

  function syncDrawerControlsFromState() {
    const sSplit = document.getElementById('sliderSlidesSplit');
    const valSlides = document.getElementById('valSlidesSplit');
    const bSlides = document.getElementById('badgeSlidesSplit');
    const curSplit = currentLayout.slidesWidthPercent || 50;
    if (sSplit) sSplit.value = curSplit;
    if (valSlides) valSlides.textContent = `${curSplit}% / ${100 - curSplit}%`;
    if (bSlides) bSlides.textContent = `${curSplit}% / ${100 - curSplit}%`;

    const sTop = document.getElementById('sliderTopHeight');
    const valTop = document.getElementById('valTopHeight');
    const bTop = document.getElementById('badgeTopHeight');
    const curTop = currentLayout.topHeight || 92;
    if (sTop) sTop.value = curTop;
    if (valTop) valTop.textContent = `${curTop}px`;
    if (bTop) bTop.textContent = `${curTop}px`;
  }

  initTabSizeDrawer();

  // =========================================================================
  // 7. HIGH-RESOLUTION SLIDE PREVIEW RENDERING & RESIZE OBSERVER
  // =========================================================================
  async function renderSlideToCanvas(pageNumber, canvas) {
    if (!canvas || pageNumber < 1 || pageNumber > totalPages) return;

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

    // Render Live Slide
    await renderSlideToCanvas(currentPage, confCurrentCanvas);

    // Render Up Next Slide
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

    // Update Teleprompter Notes
    updateNotes();
    if (confNotesViewport) {
      confNotesViewport.scrollTop = 0;
    }
  }

  function updateNotes() {
    if (!confNotesText) return;

    let note = currentNotes[currentPage];
    if (note === undefined && engine) {
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

  // Automatic canvas re-render on container resize
  let resizeDebounceTimer = null;
  if (window.ResizeObserver && confDashboardGrid) {
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        if (typeof updateSlides === 'function') {
          updateSlides(currentPage);
        }
      }, 60);
    });
    ro.observe(confDashboardGrid);
  }

  // =========================================================================
  // 8. TIMER & STAGE CUE TELEMETRY
  // =========================================================================
  function updateTimerUI(data) {
    if (!confTimerDisplay || !data) return;

    confTimerDisplay.textContent = data.timerDisplay || data.formatted || '00:00';
    confTimerDisplay.className = 'conf-timer-display';

    let phase = data.timerPhase || data.phase || 'normal';
    if (phase === 'cyan') phase = 'normal';
    confTimerDisplay.classList.add(`phase-${phase}`);
  }

  let stageCueTimeout = null;
  function handleStageCue(message, duration = 10000) {
    if (!confStageCueBanner) return;

    if (stageCueTimeout) {
      clearTimeout(stageCueTimeout);
      stageCueTimeout = null;
    }

    if (message && String(message).trim()) {
      if (confStageCueText) confStageCueText.textContent = String(message).trim();
      confStageCueBanner.style.display = 'flex';
      if (confCueIdleMsg) confCueIdleMsg.style.display = 'none';

      const dur = Number(duration || 10000);
      if (dur > 0) {
        stageCueTimeout = setTimeout(() => {
          confStageCueBanner.style.display = 'none';
          if (confCueIdleMsg) confCueIdleMsg.style.display = 'flex';
          stageCueTimeout = null;
        }, dur);
      }
    } else {
      confStageCueBanner.style.display = 'none';
      if (confCueIdleMsg) confCueIdleMsg.style.display = 'flex';
    }
  }

  // =========================================================================
  // 9. CROSS-WINDOW SYNC LISTENERS
  // =========================================================================
  function setupSyncListeners() {
    const handleSync = (data) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case 'PAGE_CHANGED':
        case 'GOTO_PAGE':
          if (data.page && Number(data.page) !== currentPage) {
            updateSlides(Number(data.page));
          }
          break;

        case 'TIMER_TICK':
        case 'TIMER_UPDATE':
        case 'TIMER_CONTROL':
          updateTimerUI(data);
          break;

        case 'STAGE_CUE':
          handleStageCue(data.message, data.duration);
          break;

        case 'SHOW_BANNER':
          if (data.target === 'stage' || data.target === 'confidence' || data.target === 'all') {
            handleStageCue(data.message, data.duration);
          }
          break;

        case 'LOAD_DOCUMENT':
          if (data.isDemo) {
            loadDemoDeck();
          } else {
            loadDocumentData(data.pdfData || data.pdfBuffer, data.streamUrl, data.title);
          }
          break;
      }
    };

    if (typeof syncBus !== 'undefined' && syncBus && syncBus.on) {
      syncBus.on('PAGE_CHANGED', handleSync);
      syncBus.on('GOTO_PAGE', handleSync);
      syncBus.on('TIMER_TICK', handleSync);
      syncBus.on('TIMER_UPDATE', handleSync);
      syncBus.on('TIMER_CONTROL', handleSync);
      syncBus.on('STAGE_CUE', handleSync);
      syncBus.on('SHOW_BANNER', handleSync);
      syncBus.on('LOAD_DOCUMENT', handleSync);
    }

    if (window.electronAPI && window.electronAPI.onSync) {
      window.electronAPI.onSync(handleSync);
    }
  }

  setupSyncListeners();

  // =========================================================================
  // 10. DOCUMENT INGESTION & BOOTSTRAP
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
        const hasValidBuffer = pdfData && (pdfData.byteLength > 0 || pdfData.length > 0);
        if (hasValidBuffer) {
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
    loadDashboardState();

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
          const hasData = data.pdfData && (data.pdfData.byteLength > 0 || data.pdfData.length > 0);
          if (data.config.isDemo || (!hasData && !data.streamUrl)) {
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

    await loadDemoDeck();
  }

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

  // Expose ConfidenceMonitor API on window
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

  initConfidenceMonitor();

})();
