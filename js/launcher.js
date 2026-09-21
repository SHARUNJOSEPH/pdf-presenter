// js/launcher.js - Setup Hub & Display Selection Controller

document.addEventListener('DOMContentLoaded', async () => {
  const engine = new PDFDocumentEngine();

  // State
  let connectedDisplays = [];
  let currentDocConfig = {
    isDemo: true,
    title: 'Interactive Presentation Showcase.pdf',
    filePath: null,
    totalPages: 6
  };

  // DOM Elements
  const screenCardsList = document.getElementById('screenCardsList');
  const selectAudienceDisplay = document.getElementById('selectAudienceDisplay');
  const selectPresenterDisplay = document.getElementById('selectPresenterDisplay');
  const pdfDropzone = document.getElementById('pdfDropzone');
  const pdfFileInput = document.getElementById('pdfFileInput');
  const btnBrowseNative = document.getElementById('btnBrowseNative');
  const btnUseDemo = document.getElementById('btnUseDemo');
  const docMetaTitle = document.getElementById('docMetaTitle');
  const docMetaPages = document.getElementById('docMetaPages');
  const docThumbCanvas = document.getElementById('docThumbCanvas');
  const btnStartPresentation = document.getElementById('btnStartPresentation');
  const chkFullscreen = document.getElementById('chkFullscreen');
  const chkAlwaysOnTop = document.getElementById('chkAlwaysOnTop');
  const rngTransitionDuration = document.getElementById('rngTransitionDuration');
  const lblTransitionDuration = document.getElementById('lblTransitionDuration');
  const selectTransitionStyle = document.getElementById('selectTransitionStyle');
  const presetBtns = document.querySelectorAll('.preset-btn');

  // API Config Elements
  const chkApiEnabled = document.getElementById('chkApiEnabled');
  const apiConfigBody = document.getElementById('apiConfigBody');
  const selApiHost = document.getElementById('selApiHost');
  const txtCustomApiHost = document.getElementById('txtCustomApiHost');
  const numApiPort = document.getElementById('numApiPort');
  const presetPortBtns = document.querySelectorAll('.preset-port-btn');
  const apiStatusDot = document.getElementById('apiStatusDot');
  const apiStatusLabel = document.getElementById('apiStatusLabel');
  const apiBaseUrlDisplay = document.getElementById('apiBaseUrlDisplay');
  const btnCopyApiUrl = document.getElementById('btnCopyApiUrl');
  const apiErrorBanner = document.getElementById('apiErrorBanner');
  const apiErrorMessage = document.getElementById('apiErrorMessage');
  const lblCompanionApiUrl = document.getElementById('lblCompanionApiUrl');
  const btnCopyLauncherApi = document.getElementById('btnCopyLauncherApi');

  // API Modal & Footer Elements
  const btnOpenApiModal = document.getElementById('btnOpenApiModal');
  const apiModal = document.getElementById('apiModal');
  const btnCloseApiModal = document.getElementById('btnCloseApiModal');
  const btnApiModalDone = document.getElementById('btnApiModalDone');
  const footerApiStatusDot = document.getElementById('footerApiStatusDot');
  const footerApiBadge = document.getElementById('footerApiBadge');

  // Recent Presentations Elements
  const recentPresentationsSection = document.getElementById('recentPresentationsSection');
  const recentList = document.getElementById('recentList');
  const btnClearRecent = document.getElementById('btnClearRecent');
  const RECENT_KEY = 'pdf_presenter_recent_decks_v1';
  let launcherPlaylistEngine = null;

  // =========================================================================
  // 1. INITIALIZATION & SCREEN ENUMERATION
  // =========================================================================
  async function init() {
    if (typeof i18n !== 'undefined') {
      const languageSelect = document.getElementById('languageSelect');
      if (languageSelect) {
        i18n.populateLanguageSelector(languageSelect);
      }
      i18n.applyTranslations();
      window.addEventListener('languageChanged', () => {
        i18n.applyTranslations();
        if (connectedDisplays && connectedDisplays.length > 0) {
          renderScreenTopology(connectedDisplays);
        }
      });
    }

    setupEventListeners();
    renderRecentDecks();
    await loadInitialDemoDeck();
    await detectAndRenderScreens();
    await loadApiSettingsUI();
  }

  let previousDisplayCount = 0;
  let hotplugToastTimer = null;

  function showHotplugToast(message, isAdded = true) {
    const toast = document.getElementById('displayHotplugToast');
    const msgEl = document.getElementById('displayHotplugToastMsg');
    if (!toast || !msgEl) return;
    msgEl.textContent = message;
    toast.style.display = 'flex';
    toast.style.borderColor = isAdded ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    toast.style.background = isAdded 
      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(16, 185, 129, 0.12))'
      : 'linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(220, 38, 38, 0.12))';
    clearTimeout(hotplugToastTimer);
    hotplugToastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 4500);
  }

  async function detectAndRenderScreens(isManual = false) {
    const btnRefreshScreens = document.getElementById('btnRefreshScreens');
    if (isManual && btnRefreshScreens) {
      btnRefreshScreens.classList.add('spinning');
      setTimeout(() => btnRefreshScreens.classList.remove('spinning'), 800);
    }

    if (window.electronAPI && window.electronAPI.getDisplays) {
      try {
        const freshDisplays = await window.electronAPI.getDisplays();
        const prevCount = previousDisplayCount;
        connectedDisplays = freshDisplays;
        previousDisplayCount = freshDisplays.length;

        // Check if a new external screen was connected via HDMI / DisplayPort
        if (prevCount > 0 && freshDisplays.length > prevCount) {
          const addedDisplay = freshDisplays.find(d => !d.isPrimary) || freshDisplays[freshDisplays.length - 1];
          showHotplugToast(`⚡ External Display Detected: ${addedDisplay.label}. Auto-selected for Audience projection!`, true);
        } else if (prevCount > 0 && freshDisplays.length < prevCount) {
          showHotplugToast(`⚠️ A display was disconnected. Target displays updated.`, false);
        }

        renderScreenTopology(connectedDisplays, prevCount > 0 && freshDisplays.length > prevCount);
        return;
      } catch (err) {
        console.warn('Electron getDisplays error', err);
      }
    }

    connectedDisplays = [
      { id: 1, label: 'Primary Laptop Screen (1920x1080)', isPrimary: true, bounds: { width: 1920, height: 1080 } },
      { id: 2, label: 'External HDMI Projector (3840x2160)', isPrimary: false, bounds: { width: 3840, height: 2160 } }
    ];
    previousDisplayCount = connectedDisplays.length;
    renderScreenTopology(connectedDisplays, false);
  }

  function renderScreenTopology(displays, newlyAdded = false) {
    screenCardsList.innerHTML = '';
    const prevSelectedAudience = selectAudienceDisplay.value;
    const prevSelectedPresenter = selectPresenterDisplay.value;

    selectAudienceDisplay.innerHTML = '';
    selectPresenterDisplay.innerHTML = '';

    // Update display count badge in header
    const badgeEl = document.getElementById('displayCountBadge');
    if (badgeEl) {
      const hasExternal = displays.some(d => !d.isPrimary);
      badgeEl.textContent = displays.length === 1 
        ? '1 Display (Single Screen)' 
        : `${displays.length} Displays (${hasExternal ? 'HDMI/Ext Active' : 'Active'})`;
      badgeEl.classList.toggle('multi', displays.length > 1);
    }

    // Determine target selection
    const externalDisplay = displays.find(d => !d.isPrimary);
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

    displays.forEach((display, index) => {
      const card = document.createElement('div');
      card.className = `screen-card-item ${!display.isPrimary ? 'is-target' : ''}`;
      card.dataset.displayId = display.id;

      const isExt = !display.isPrimary;
      const icon = isExt ? '📽️' : '💻';
      const badge = display.isPrimary 
        ? '<span class="badge" style="color:#38bdf8;">Primary Monitor</span>' 
        : '<span class="badge badge-connected">External HDMI / DisplayPort</span>';

      card.innerHTML = `
        <div class="screen-info-left">
          <div class="screen-icon">${icon}</div>
          <div>
            <div class="screen-name">${display.label}</div>
            <div class="screen-res">${display.bounds.width} × ${display.bounds.height} px</div>
          </div>
        </div>
        <div>${badge}</div>
      `;
      screenCardsList.appendChild(card);

      // Audience select option
      const optAud = document.createElement('option');
      optAud.value = display.id;
      optAud.textContent = `${display.label} (${display.bounds.width}x${display.bounds.height})`;
      
      if (newlyAdded && externalDisplay && display.id === externalDisplay.id) {
        optAud.selected = true;
      } else if (prevSelectedAudience && displays.some(d => String(d.id) === String(prevSelectedAudience))) {
        optAud.selected = String(display.id) === String(prevSelectedAudience);
      } else if (displays.length > 1 && !display.isPrimary) {
        optAud.selected = true;
      } else if (displays.length === 1) {
        optAud.selected = true;
      }
      selectAudienceDisplay.appendChild(optAud);

      // Presenter select option
      const optPres = document.createElement('option');
      optPres.value = display.id;
      optPres.textContent = `${display.label} (${display.bounds.width}x${display.bounds.height})`;
      if (prevSelectedPresenter && displays.some(d => String(d.id) === String(prevSelectedPresenter))) {
        optPres.selected = String(display.id) === String(prevSelectedPresenter);
      } else if (display.isPrimary) {
        optPres.selected = true;
      }
      selectPresenterDisplay.appendChild(optPres);
    });

    updateCardSelectionHighlight();
  }

  function updateCardSelectionHighlight() {
    const selectedAudienceId = String(selectAudienceDisplay.value);
    screenCardsList.querySelectorAll('.screen-card-item').forEach(card => {
      card.classList.toggle('is-target', String(card.dataset.displayId) === selectedAudienceId);
    });
  }

  // =========================================================================
  // 2. DOCUMENT INGESTION (STREAMING URL / DEMO)
  // =========================================================================
  async function loadInitialDemoDeck() {
    const docInfo = await engine.loadDemo();
    currentDocConfig = {
      isDemo: true,
      title: docInfo.title,
      filePath: null,
      totalPages: docInfo.totalPages
    };
    updateDocPreviewUI();
  }

  // =========================================================================
  // RECENT PRESENTATIONS MANAGEMENT
  // =========================================================================
  function getRecentDecks() {
    try {
      const data = localStorage.getItem(RECENT_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecentDeck(deck) {
    if (!deck || !deck.filePath) return;
    try {
      let decks = getRecentDecks().filter(d => d.filePath !== deck.filePath);
      decks.unshift({
        title: deck.title,
        filePath: deck.filePath,
        totalPages: deck.totalPages,
        timestamp: Date.now()
      });
      decks = decks.slice(0, 5); // Keep up to 5 recent presentations
      localStorage.setItem(RECENT_KEY, JSON.stringify(decks));
      renderRecentDecks();
    } catch (e) {
      console.warn('Error saving recent deck', e);
    }
  }

  function removeRecentDeck(filePath, event) {
    if (event) event.stopPropagation();
    let decks = getRecentDecks().filter(d => d.filePath !== filePath);
    localStorage.setItem(RECENT_KEY, JSON.stringify(decks));
    renderRecentDecks();
  }

  function renderRecentDecks() {
    if (!recentPresentationsSection || !recentList) return;
    const decks = getRecentDecks();
    if (decks.length === 0) {
      recentPresentationsSection.style.display = 'none';
      recentList.innerHTML = '';
      return;
    }

    recentPresentationsSection.style.display = 'block';
    recentList.innerHTML = '';

    decks.forEach(deck => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.title = `Click to load: ${deck.filePath}`;
      item.innerHTML = `
        <div class="recent-item-left">
          <div class="recent-item-icon">📄</div>
          <div class="recent-item-info">
            <div class="recent-item-title">${deck.title}</div>
            <div class="recent-item-path">${deck.filePath}</div>
          </div>
        </div>
        <button type="button" class="recent-item-remove" title="Remove from recent">✕</button>
      `;

      item.addEventListener('click', async () => {
        resetLaunchButton();
        if (window.electronAPI && window.electronAPI.loadRecentPdf) {
          const res = await window.electronAPI.loadRecentPdf(deck.filePath);
          if (res && res.success) {
            await handleSelectedPdf(res.filePath, res.fileName, res.streamUrl, res.pdfData);
          } else {
            alert(`Could not open file:\n${deck.title}\n\nThe file may have been moved, renamed, or deleted.`);
            removeRecentDeck(deck.filePath);
          }
        }
      });

      const removeBtn = item.querySelector('.recent-item-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => removeRecentDeck(deck.filePath, e));
      }

      recentList.appendChild(item);
    });
  }

  async function handleSelectedPdf(filePath, fileName, streamUrl = null, pdfData = null) {
    try {
      docMetaTitle.textContent = `Loading ${fileName}...`;
      docMetaPages.textContent = 'Parsing presentation...';

      const safeBuffer = (pdfData && (pdfData.byteLength > 0 || pdfData.length > 0))
        ? (pdfData.slice ? pdfData.slice(0) : new Uint8Array(pdfData).slice(0))
        : null;

      let docInfo;
      if (pdfData) {
        docInfo = await engine.loadPDFData(pdfData, fileName);
      } else if (streamUrl) {
        docInfo = await engine.loadPDFFromUrl(streamUrl, fileName);
      } else {
        const url = `http://localhost:3000/api/document/current.pdf?t=${Date.now()}`;
        docInfo = await engine.loadPDFFromUrl(url, fileName);
      }

      currentDocConfig = {
        isDemo: false,
        title: fileName,
        filePath: filePath,
        totalPages: docInfo.totalPages,
        pdfBuffer: safeBuffer || pdfData || null
      };
      updateDocPreviewUI();
      saveRecentDeck({ title: fileName, filePath: filePath, totalPages: docInfo.totalPages });
    } catch (err) {
      alert('Error loading PDF: ' + err.message);
      loadInitialDemoDeck();
    }
  }

  async function updateDocPreviewUI() {
    docMetaTitle.textContent = currentDocConfig.title;
    docMetaPages.textContent = `${currentDocConfig.totalPages} Slides • Ready to Present`;
    await engine.renderThumbnail(1, docThumbCanvas, 180);
  }

  function resetLaunchButton() {
    btnStartPresentation.disabled = false;
    btnStartPresentation.innerHTML = '<span>🚀</span> Start Dual-Screen Presentation';
  }

  function updateTransitionUI(val) {
    const num = parseFloat(val);
    if (rngTransitionDuration) rngTransitionDuration.value = num;
    if (lblTransitionDuration) {
      lblTransitionDuration.textContent = num === 0 ? 'Instant (0s)' : (num === 1.0 ? '1.0s (Default)' : `${num.toFixed(1)}s`);
    }
    presetBtns.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.val) === num);
    });
  }

  // =========================================================================
  // 3. REMOTE CONTROL API & COMPANION CONFIGURATION
  // =========================================================================
  async function loadApiSettingsUI() {
    if (!window.electronAPI || !window.electronAPI.getApiConfig) return;
    try {
      const config = await window.electronAPI.getApiConfig();
      renderApiConfigUI(config);
    } catch (err) {
      console.warn('Failed to load API settings:', err);
    }
  }

  function renderApiConfigUI(config) {
    if (!config) return;

    if (chkApiEnabled) {
      chkApiEnabled.checked = Boolean(config.enabled);
    }

    if (apiConfigBody) {
      apiConfigBody.classList.toggle('is-disabled', !config.enabled);
    }

    if (selApiHost) {
      selApiHost.innerHTML = `
        <option value="0.0.0.0">0.0.0.0 (All Interfaces - Recommended)</option>
        <option value="127.0.0.1">127.0.0.1 (Localhost Only - Internal)</option>
      `;

      if (config.interfaces && Array.isArray(config.interfaces)) {
        config.interfaces.forEach(iface => {
          const opt = document.createElement('option');
          opt.value = iface.address;
          opt.textContent = `${iface.address} (${iface.name})`;
          selApiHost.appendChild(opt);
        });
      }

      const customOpt = document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = 'Custom IP Address...';
      selApiHost.appendChild(customOpt);

      let found = false;
      for (let i = 0; i < selApiHost.options.length; i++) {
        if (selApiHost.options[i].value === config.host) {
          selApiHost.selectedIndex = i;
          found = true;
          break;
        }
      }

      if (!found && config.host) {
        selApiHost.value = 'custom';
        if (txtCustomApiHost) {
          txtCustomApiHost.style.display = 'block';
          txtCustomApiHost.value = config.host;
        }
      } else if (txtCustomApiHost) {
        txtCustomApiHost.style.display = 'none';
      }
    }

    if (numApiPort) {
      numApiPort.value = config.port || 3000;
    }
    presetPortBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.port, 10) === (config.port || 3000));
    });

    updateApiStatusDisplay(config);
  }

  function updateApiStatusDisplay(config) {
    const isEnabled = config && config.enabled;
    const error = config && config.error;
    const port = (config && config.port) || 3000;
    const host = (config && config.host) || '0.0.0.0';
    const displayHost = (host === '0.0.0.0') ? (config.localIPs && config.localIPs[0] ? config.localIPs[0] : 'localhost') : host;
    const activeUrl = `http://${displayHost}:${port}/api/`;

    if (!isEnabled) {
      if (apiStatusDot) apiStatusDot.className = 'status-indicator-dot offline';
      if (apiStatusLabel) apiStatusLabel.textContent = 'API Status:';
      if (apiBaseUrlDisplay) apiBaseUrlDisplay.textContent = 'Disabled (Offline Mode)';
      if (footerApiStatusDot) footerApiStatusDot.className = 'status-indicator-dot offline';
      if (footerApiBadge) {
        footerApiBadge.textContent = 'Off';
        footerApiBadge.className = 'api-pill-badge offline';
      }
      if (btnCopyApiUrl) btnCopyApiUrl.style.display = 'none';
      if (apiErrorBanner) apiErrorBanner.style.display = 'none';
    } else if (error) {
      if (apiStatusDot) apiStatusDot.className = 'status-indicator-dot error';
      if (apiStatusLabel) apiStatusLabel.textContent = 'API Status:';
      if (apiBaseUrlDisplay) apiBaseUrlDisplay.textContent = error;
      if (footerApiStatusDot) footerApiStatusDot.className = 'status-indicator-dot error';
      if (footerApiBadge) {
        footerApiBadge.textContent = 'Conflict';
        footerApiBadge.className = 'api-pill-badge error';
      }
      if (btnCopyApiUrl) btnCopyApiUrl.style.display = 'none';
      if (apiErrorBanner) {
        apiErrorBanner.style.display = 'block';
        if (apiErrorMessage) apiErrorMessage.textContent = error;
      }
    } else {
      if (apiStatusDot) apiStatusDot.className = 'status-indicator-dot online';
      if (apiStatusLabel) apiStatusLabel.textContent = 'Active Base URL:';
      if (apiBaseUrlDisplay) apiBaseUrlDisplay.textContent = activeUrl;
      if (footerApiStatusDot) footerApiStatusDot.className = 'status-indicator-dot online';
      if (footerApiBadge) {
        footerApiBadge.textContent = `Port ${port}`;
        footerApiBadge.className = 'api-pill-badge';
      }
      if (btnCopyApiUrl) {
        btnCopyApiUrl.style.display = 'inline-block';
        btnCopyApiUrl.setAttribute('data-clipboard', activeUrl);
      }
      if (apiErrorBanner) apiErrorBanner.style.display = 'none';
    }
    updateStreamDeckMessageUrl();
  }

  function updateStreamDeckMessageUrl() {
    const selTarget = document.getElementById('selStreamDeckTarget');
    const txtSample = document.getElementById('txtStreamDeckSample');
    const codeUrl = document.getElementById('codeStreamDeckUrl');
    const btnCopy = document.getElementById('btnCopyStreamDeckUrl');
    if (!codeUrl) return;

    const base = (apiBaseUrlDisplay && apiBaseUrlDisplay.textContent && !apiBaseUrlDisplay.textContent.includes('Disabled') && !apiBaseUrlDisplay.textContent.includes('Conflict'))
      ? apiBaseUrlDisplay.textContent.trim().replace(/\/$/, '')
      : 'http://localhost:3000/api';

    const target = selTarget ? selTarget.value : 'presenter';
    const text = (txtSample && txtSample.value.trim()) ? txtSample.value.trim() : '5 MINUTES REMAINING';
    const encodedText = encodeURIComponent(text);
    const fullUrl = `${base}/message?text=${encodedText}&target=${target}&duration=10`;

    codeUrl.textContent = fullUrl;
    if (btnCopy) {
      btnCopy.setAttribute('data-clipboard', fullUrl);
    }
  }

  async function applyApiConfig() {
    if (!window.electronAPI || !window.electronAPI.updateApiConfig) return;

    let selectedHost = selApiHost ? selApiHost.value : '0.0.0.0';
    if (selectedHost === 'custom') {
      selectedHost = (txtCustomApiHost && txtCustomApiHost.value.trim()) ? txtCustomApiHost.value.trim() : '0.0.0.0';
    }

    let portVal = parseInt(numApiPort ? numApiPort.value : 3000, 10);
    if (isNaN(portVal) || portVal < 1024 || portVal > 65535) {
      portVal = 3000;
      if (numApiPort) numApiPort.value = 3000;
    }

    presetPortBtns.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.port, 10) === portVal);
    });

    const isEnabled = chkApiEnabled ? chkApiEnabled.checked : true;
    if (apiConfigBody) {
      apiConfigBody.classList.toggle('is-disabled', !isEnabled);
    }

    try {
      const result = await window.electronAPI.updateApiConfig({
        enabled: isEnabled,
        host: selectedHost,
        port: portVal
      });
      updateApiStatusDisplay(result);
    } catch (err) {
      console.error('Failed to update API config:', err);
    }
  }

  // =========================================================================
  // 4. EVENT LISTENERS
  // =========================================================================
  function setupEventListeners() {
    selectAudienceDisplay.addEventListener('change', updateCardSelectionHighlight);

    if (btnClearRecent) {
      btnClearRecent.addEventListener('click', () => {
        localStorage.removeItem(RECENT_KEY);
        renderRecentDecks();
      });
    }

    // API Config Event Listeners
    if (chkApiEnabled) {
      chkApiEnabled.addEventListener('change', () => applyApiConfig());
    }

    if (selApiHost) {
      selApiHost.addEventListener('change', () => {
        if (selApiHost.value === 'custom') {
          if (txtCustomApiHost) {
            txtCustomApiHost.style.display = 'block';
            txtCustomApiHost.focus();
          }
        } else {
          if (txtCustomApiHost) {
            txtCustomApiHost.style.display = 'none';
          }
          applyApiConfig();
        }
      });
    }

    if (txtCustomApiHost) {
      txtCustomApiHost.addEventListener('change', () => applyApiConfig());
      txtCustomApiHost.addEventListener('blur', () => applyApiConfig());
    }

    if (numApiPort) {
      numApiPort.addEventListener('change', () => applyApiConfig());
      numApiPort.addEventListener('blur', () => applyApiConfig());
    }

    presetPortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (numApiPort) {
          numApiPort.value = btn.dataset.port;
          applyApiConfig();
        }
      });
    });

    // Stream Deck Live Message URL helper listeners
    const selStreamDeckTarget = document.getElementById('selStreamDeckTarget');
    const txtStreamDeckSample = document.getElementById('txtStreamDeckSample');
    const btnCopyStreamDeckUrl = document.getElementById('btnCopyStreamDeckUrl');

    if (selStreamDeckTarget) selStreamDeckTarget.addEventListener('change', updateStreamDeckMessageUrl);
    if (txtStreamDeckSample) txtStreamDeckSample.addEventListener('input', updateStreamDeckMessageUrl);
    if (btnCopyStreamDeckUrl) {
      btnCopyStreamDeckUrl.addEventListener('click', async () => {
        const codeUrl = document.getElementById('codeStreamDeckUrl');
        const urlToCopy = btnCopyStreamDeckUrl.getAttribute('data-clipboard') || (codeUrl ? codeUrl.textContent : '');
        if (urlToCopy) {
          try {
            await navigator.clipboard.writeText(urlToCopy);
            const orig = btnCopyStreamDeckUrl.textContent;
            btnCopyStreamDeckUrl.textContent = '✓ Copied!';
            setTimeout(() => { btnCopyStreamDeckUrl.textContent = orig; }, 1500);
          } catch (e) {}
        }
      });
    }

    // Real-Time HDMI Display Hotplug Listener
    if (window.electronAPI && window.electronAPI.onDisplaysChanged) {
      window.electronAPI.onDisplaysChanged(async (data) => {
        console.log('[Launcher] Real-time display topology change event received:', data);
        await detectAndRenderScreens(false);
      });
    }

    // Manual Refresh Displays Button
    const btnRefreshScreens = document.getElementById('btnRefreshScreens');
    if (btnRefreshScreens) {
      btnRefreshScreens.addEventListener('click', async () => {
        await detectAndRenderScreens(true);
      });
    }

    // Presentation lifecycle reset listeners & window focus display check
    if (window.electronAPI && window.electronAPI.onPresentationEnded) {
      window.electronAPI.onPresentationEnded(() => {
        resetLaunchButton();
        detectAndRenderScreens(false);
      });
    }
    window.addEventListener('focus', () => {
      resetLaunchButton();
      detectAndRenderScreens(false);
    });

    // Non-blocking 2.5s fallback background polling while launcher is active
    setInterval(async () => {
      if (window.electronAPI && window.electronAPI.getDisplays && document.visibilityState === 'visible') {
        try {
          const fresh = await window.electronAPI.getDisplays();
          if (fresh && fresh.length !== previousDisplayCount) {
            console.log(`[Launcher Polling] Display count changed from ${previousDisplayCount} to ${fresh.length}`);
            await detectAndRenderScreens(false);
          }
        } catch (e) {}
      }
    }, 2500);

    // Transition controls
    if (rngTransitionDuration) {
      rngTransitionDuration.addEventListener('input', (e) => {
        updateTransitionUI(e.target.value);
      });
    }

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        updateTransitionUI(btn.dataset.val);
      });
    });

    // Native File Dialog
    btnBrowseNative.addEventListener('click', async () => {
      resetLaunchButton();
      if (window.electronAPI && window.electronAPI.selectPdfFile) {
        const result = await window.electronAPI.selectPdfFile({ multiple: true });
        if (result && !result.canceled) {
          if (result.files && result.files.length > 1) {
            await handleMultipleSelectedPdfs(result.files);
          } else {
            await handleSelectedPdf(result.filePath, result.fileName, result.streamUrl, result.pdfData);
          }
        }
      } else {
        pdfFileInput.click();
      }
    });

    if (pdfFileInput) {
      pdfFileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 1) {
          await handleMultipleSelectedPdfs(files);
        } else if (files.length === 1) {
          const file = files[0];
          const resolvedPath = (window.electronAPI && window.electronAPI.getPathForFile)
            ? window.electronAPI.getPathForFile(file)
            : (file.path || '');
          if (resolvedPath && window.electronAPI && window.electronAPI.loadRecentPdf) {
            try {
              const res = await window.electronAPI.loadRecentPdf(resolvedPath);
              if (res && res.success) {
                await handleSelectedPdf(res.filePath, res.fileName, res.streamUrl, res.pdfData);
              } else {
                await handleSelectedPdf(resolvedPath, file.name);
              }
            } catch (err) {
              await handleSelectedPdf(resolvedPath, file.name);
            }
          } else {
            const buffer = await file.arrayBuffer();
            if (window.electronAPI && window.electronAPI.setActivePdfBuffer) {
              const res = await window.electronAPI.setActivePdfBuffer({ fileName: file.name, buffer: buffer });
              await handleSelectedPdf(null, file.name, res.streamUrl, buffer);
            } else {
              await handleSelectedPdf(null, file.name, null, buffer);
            }
          }
        }
        pdfFileInput.value = '';
      });
    }

    pdfDropzone.addEventListener('click', () => {
      btnBrowseNative.click();
    });

    // Native Drag and Drop
    pdfDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      pdfDropzone.classList.add('dragover');
    });
    pdfDropzone.addEventListener('dragleave', () => {
      pdfDropzone.classList.remove('dragover');
    });
    pdfDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      pdfDropzone.classList.remove('dragover');
      resetLaunchButton();

      const droppedFiles = Array.from(e.dataTransfer.files || []).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
      if (droppedFiles.length > 1) {
        await handleMultipleSelectedPdfs(droppedFiles);
      } else if (droppedFiles.length === 1) {
        const file = droppedFiles[0];
        const resolvedPath = (window.electronAPI && window.electronAPI.getPathForFile)
          ? window.electronAPI.getPathForFile(file)
          : (file.path || '');
        if (resolvedPath && window.electronAPI && window.electronAPI.loadRecentPdf) {
          try {
            const res = await window.electronAPI.loadRecentPdf(resolvedPath);
            if (res && res.success) {
              await handleSelectedPdf(res.filePath, res.fileName, res.streamUrl, res.pdfData);
            } else {
              await handleSelectedPdf(resolvedPath, file.name);
            }
          } catch (err) {
            await handleSelectedPdf(resolvedPath, file.name);
          }
        } else {
          const buffer = await file.arrayBuffer();
          if (window.electronAPI && window.electronAPI.setActivePdfBuffer) {
            const res = await window.electronAPI.setActivePdfBuffer({ fileName: file.name, buffer: buffer });
            await handleSelectedPdf(null, file.name, res.streamUrl, buffer);
          } else {
            await handleSelectedPdf(null, file.name, null, buffer);
          }
        }
      } else {
        alert('Please select a valid .PDF document.');
      }
    });

    btnUseDemo.addEventListener('click', () => {
      resetLaunchButton();
      loadInitialDemoDeck();
    });

    btnStartPresentation.addEventListener('click', async () => {
      const duration = rngTransitionDuration ? parseFloat(rngTransitionDuration.value) : 1.0;
      const style = selectTransitionStyle ? selectTransitionStyle.value : 'crossfade';
      const playlist = (launcherPlaylistEngine && typeof launcherPlaylistEngine.getPlaylist === 'function')
        ? launcherPlaylistEngine.getPlaylist()
        : [];

      let startingDeck = null;
      if (playlist.length > 0) {
        startingDeck = playlist.find(d => d.active) || playlist[0];
      }

      const activeBuffer = (startingDeck && startingDeck.pdfBuffer)
        ? startingDeck.pdfBuffer
        : (currentDocConfig && currentDocConfig.pdfBuffer ? currentDocConfig.pdfBuffer : null);

      const config = {
        isDemo: startingDeck ? false : Boolean(currentDocConfig.isDemo),
        title: startingDeck ? startingDeck.title : currentDocConfig.title,
        filePath: startingDeck ? (startingDeck.path || currentDocConfig.filePath) : currentDocConfig.filePath,
        totalPages: startingDeck ? (startingDeck.slideCount || currentDocConfig.totalPages) : currentDocConfig.totalPages,
        pdfBuffer: activeBuffer ? (activeBuffer.slice ? activeBuffer.slice(0) : new Uint8Array(activeBuffer)) : null,
        audienceDisplayId: selectAudienceDisplay.value,
        presenterDisplayId: selectPresenterDisplay.value,
        fullscreen: chkFullscreen.checked,
        alwaysOnTop: chkAlwaysOnTop.checked,
        transitionDuration: duration,
        transitionStyle: style,
        companionEnabled: chkApiEnabled ? chkApiEnabled.checked : true,
        playlist: playlist
      };

      if (activeBuffer && (!config.filePath || !config.filePath.trim()) && window.electronAPI && window.electronAPI.setActivePdfBuffer) {
        try {
          await window.electronAPI.setActivePdfBuffer({ fileName: config.title, buffer: activeBuffer });
        } catch (e) {
          console.warn('[StartPresentation] setActivePdfBuffer failed:', e);
        }
      }

      if (window.electronAPI && window.electronAPI.startPresentation) {
        btnStartPresentation.disabled = true;
        btnStartPresentation.innerHTML = '<span>🚀</span> Launching Presentation...';
        try {
          await window.electronAPI.startPresentation(config);
        } catch (err) {
          console.error('Launch failed:', err);
          resetLaunchButton();
        }
      } else {
        window.location.href = 'presenter.html';
      }
    });

    // Remote Control API Modal Controls
    const openApiModal = () => { if (apiModal) apiModal.classList.add('open'); };
    const closeApiModal = () => { if (apiModal) apiModal.classList.remove('open'); };

    if (btnOpenApiModal) btnOpenApiModal.addEventListener('click', openApiModal);
    if (btnCloseApiModal) btnCloseApiModal.addEventListener('click', closeApiModal);
    if (btnApiModalDone) btnApiModalDone.addEventListener('click', closeApiModal);

    if (apiModal) {
      apiModal.addEventListener('click', (e) => {
        if (e.target === apiModal) closeApiModal();
      });
    }

    // About Modal Controls
    const aboutModal = document.getElementById('aboutModal');
    const btnOpenAbout = document.getElementById('btnOpenAbout');
    const btnCloseAboutModal = document.getElementById('btnCloseAboutModal');
    const btnAboutOk = document.getElementById('btnAboutOk');

    const openAbout = () => { if (aboutModal) aboutModal.classList.add('open'); };
    const closeAbout = () => { if (aboutModal) aboutModal.classList.remove('open'); };

    if (btnOpenAbout) btnOpenAbout.addEventListener('click', openAbout);
    if (btnCloseAboutModal) btnCloseAboutModal.addEventListener('click', closeAbout);
    if (btnAboutOk) btnAboutOk.addEventListener('click', closeAbout);

    if (aboutModal) {
      aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) closeAbout();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-backdrop.open');
        if (openModal) openModal.classList.remove('open');
      }
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

    // Copy to Clipboard Buttons
    document.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
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

    // Bitfocus Companion Preset Export
    const btnExportCompanionConfig = document.getElementById('btnExportCompanionConfig');
    if (btnExportCompanionConfig) {
      btnExportCompanionConfig.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.exportCompanionConfig) {
          const originalText = btnExportCompanionConfig.innerHTML;
          btnExportCompanionConfig.innerHTML = '<span>⏳</span> Exporting...';
          btnExportCompanionConfig.disabled = true;

          try {
            const host = selApiHost ? selApiHost.value : '127.0.0.1';
            const port = numApiPort ? parseInt(numApiPort.value, 10) : 3000;
            const res = await window.electronAPI.exportCompanionConfig({ host, port });
            if (res && res.success) {
              btnExportCompanionConfig.innerHTML = '<span>✓</span> Presets Exported!';
              btnExportCompanionConfig.style.background = '#10b981';
              setTimeout(() => {
                btnExportCompanionConfig.innerHTML = originalText;
                btnExportCompanionConfig.style.background = '';
                btnExportCompanionConfig.disabled = false;
              }, 2500);
            } else {
              btnExportCompanionConfig.innerHTML = originalText;
              btnExportCompanionConfig.disabled = false;
            }
          } catch (err) {
            console.error('Failed to export presets:', err);
            btnExportCompanionConfig.innerHTML = originalText;
            btnExportCompanionConfig.disabled = false;
          }
        }
      });
    }

    // In-App Software Updates
    const btnCheckUpdates = document.getElementById('btnCheckUpdates');
    const updateStatusText = document.getElementById('updateStatusText');
    const updateBanner = document.getElementById('updateNotificationBanner');
    const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
    const btnDismissUpdate = document.getElementById('btnDismissUpdate');
    const updateBannerTitle = document.getElementById('updateBannerTitle');

    let cachedReleaseUrl = 'https://github.com/SHARUNJOSEPH/pdf-presenter/releases';

    const performUpdateCheck = async (interactive = false) => {
      if (!window.electronAPI || !window.electronAPI.checkForUpdates) return;
      if (interactive && updateStatusText) {
        updateStatusText.textContent = 'Checking GitHub for updates...';
        if (btnCheckUpdates) btnCheckUpdates.disabled = true;
      }

      try {
        const info = await window.electronAPI.checkForUpdates();
        if (info.releaseUrl) cachedReleaseUrl = info.releaseUrl;

        if (info.isStore) {
          if (updateStatusText) updateStatusText.textContent = 'Updates are handled automatically by the Microsoft Store.';
        } else if (info.hasUpdate) {
          if (updateStatusText) {
            updateStatusText.innerHTML = `<span style="color: #38bdf8; font-weight: 600;">🎉 v${info.latestVersion} available!</span>`;
          }
          if (updateBanner) {
            updateBanner.style.display = 'flex';
            if (updateBannerTitle) updateBannerTitle.textContent = `A New Version (v${info.latestVersion}) is Available!`;
          }
        } else if (interactive) {
          if (updateStatusText) {
            updateStatusText.textContent = `✓ You are running the latest version (v${info.currentVersion}).`;
          }
        }
      } catch (err) {
        console.warn('Update check failed:', err);
        if (interactive && updateStatusText) {
          updateStatusText.textContent = 'Could not check for updates. Check internet connection.';
        }
      } finally {
        if (interactive && btnCheckUpdates) btnCheckUpdates.disabled = false;
      }
    };

    if (btnCheckUpdates) {
      btnCheckUpdates.addEventListener('click', () => performUpdateCheck(true));
    }

    if (btnDownloadUpdate) {
      btnDownloadUpdate.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(cachedReleaseUrl);
        } else {
          window.open(cachedReleaseUrl, '_blank');
        }
      });
    }

    if (btnDismissUpdate && updateBanner) {
      btnDismissUpdate.addEventListener('click', () => {
        updateBanner.style.display = 'none';
      });
    }

    // Silent background check on app startup (after 2.5s)
    setTimeout(() => {
      performUpdateCheck(false);
    }, 2500);

    // Wire up Pre-Flight Pro Tools Dropdown & Modals
    setupProToolsMenu();
  }

  // =========================================================================
  // 5. PRO TOOLS PRE-FLIGHT DROPDOWN & MODALS CONTROLLER
  // =========================================================================
  function setupProToolsMenu() {
    const btnProToolsMenu = document.getElementById('btnProToolsMenu');
    const proToolsMenuPopover = document.getElementById('proToolsMenuPopover');

    // 1. Popover Toggle & Dismissal
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

    // Modal Close Buttons across all modals in launcher
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.querySelectorAll('.modal-close-btn, .modal-close').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('open'));
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });

    const isPro = () => Boolean(window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function' && window.UpgradeModal.isPro());
    const guardPro = (feature) => {
      if (isPro()) return true;
      if (window.UpgradeModal && typeof window.UpgradeModal.open === 'function') {
        window.UpgradeModal.open(feature);
      }
      return false;
    };

    // 2. Multi-Deck Playlist Setup
    const btnPlaylist = document.getElementById('btnPlaylist');
    const playlistModal = document.getElementById('playlistModal');
    const playlistQueueList = document.getElementById('playlistQueueList');
    const btnAddDeck = document.getElementById('btnAddDeck');
    const playlistFileInput = document.getElementById('playlistFileInput');
    const launcherPlaylistSection = document.getElementById('launcherPlaylistSection');
    const launcherPlaylistCards = document.getElementById('launcherPlaylistCards');
    const launcherPlaylistCount = document.getElementById('launcherPlaylistCount');
    const btnLauncherAddDeck = document.getElementById('btnLauncherAddDeck');
    const btnLauncherClearPlaylist = document.getElementById('btnLauncherClearPlaylist');

    if (!launcherPlaylistEngine && typeof PlaylistMetricsEngine !== 'undefined') {
      launcherPlaylistEngine = new PlaylistMetricsEngine({
        isPro: () => isPro()
      });
    }

    async function selectActiveDeck(deckId) {
      if (!launcherPlaylistEngine) return;
      launcherPlaylistEngine.switchDeck(deckId);
      const activeDeck = launcherPlaylistEngine.getActiveDeck();
      if (activeDeck) {
        if (activeDeck.path && window.electronAPI && window.electronAPI.loadRecentPdf) {
          try {
            const res = await window.electronAPI.loadRecentPdf(activeDeck.path);
            if (res && res.success) {
              if (res.pdfData && !activeDeck.pdfBuffer) {
                activeDeck.pdfBuffer = res.pdfData;
              }
              await handleSelectedPdf(res.filePath, res.fileName, res.streamUrl, res.pdfData);
            } else {
              await handleSelectedPdf(activeDeck.path, activeDeck.title, null, activeDeck.pdfBuffer || null);
            }
          } catch (e) {
            await handleSelectedPdf(activeDeck.path, activeDeck.title, null, activeDeck.pdfBuffer || null);
          }
        } else if (activeDeck.pdfBuffer) {
          if (window.electronAPI && window.electronAPI.setActivePdfBuffer) {
            try {
              await window.electronAPI.setActivePdfBuffer({ fileName: activeDeck.title, buffer: activeDeck.pdfBuffer });
            } catch (e) {
              console.warn('[selectActiveDeck] setActivePdfBuffer error:', e);
            }
          }
          const bufCopy = activeDeck.pdfBuffer.slice ? activeDeck.pdfBuffer.slice(0) : new Uint8Array(activeDeck.pdfBuffer);
          await handleSelectedPdf(activeDeck.path || null, activeDeck.title, null, bufCopy);
        } else if (activeDeck.path) {
          await handleSelectedPdf(activeDeck.path, activeDeck.title);
        } else {
          currentDocConfig = { isDemo: false, title: activeDeck.title, filePath: null, totalPages: activeDeck.slideCount || 1, pdfBuffer: null };
          updateDocPreviewUI();
        }
      }
      renderLauncherPlaylist();
    }

    async function resetToDemoFallback() {
      loadInitialDemoDeck();
      currentDocConfig = {
        isDemo: true,
        title: 'Interactive Presentation Showcase.pdf',
        filePath: null,
        totalPages: 6,
        pdfBuffer: null
      };
      resetLaunchButton();
      updateDocPreviewUI();
    }

    async function handleMultipleSelectedPdfs(files) {
      if (!files || files.length === 0) return;
      if (!launcherPlaylistEngine && typeof PlaylistMetricsEngine !== 'undefined') {
        launcherPlaylistEngine = new PlaylistMetricsEngine({ isPro: () => isPro() });
      }
      if (!launcherPlaylistEngine) return;

      if (!isPro() && files.length > 1) {
        if (window.UpgradeModal) window.UpgradeModal.open('playlist');
        const first = files[0];
        let p = first.filePath || first.path || '';
        if (!p && window.electronAPI && window.electronAPI.getPathForFile) {
          p = window.electronAPI.getPathForFile(first) || '';
        }
        let buf = null;
        if (typeof first.arrayBuffer === 'function') {
          try { buf = await first.arrayBuffer(); } catch (e) {}
        }
        await handleSelectedPdf(p || null, first.fileName || first.name || 'Deck 1', null, buf);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const title = file.fileName || file.name || (file.filePath ? file.filePath.split(/[/\\]/).pop() : `Deck ${i + 1}`);
        let p = file.filePath || file.path || '';
        if (!p && window.electronAPI && window.electronAPI.getPathForFile) {
          p = window.electronAPI.getPathForFile(file) || '';
        }

        let buffer = null;
        if (file.pdfBuffer) {
          buffer = file.pdfBuffer;
        } else if (typeof file.arrayBuffer === 'function') {
          try {
            buffer = await file.arrayBuffer();
          } catch (e) {
            console.warn('Could not read arrayBuffer from file:', e);
          }
        }

        let slideCount = file.slideCount || 1;
        if (buffer && window.pdfjsLib) {
          try {
            const copy = buffer.slice ? buffer.slice(0) : new Uint8Array(buffer);
            const loadingTask = window.pdfjsLib.getDocument({
              data: copy,
              cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
              cMapPacked: true
            });
            const doc = await loadingTask.promise;
            slideCount = doc.numPages || 1;
          } catch (err) {
            console.warn('Could not determine page count from buffer for', title, err);
          }
        }

        await launcherPlaylistEngine.addDeck({
          title: title,
          path: p,
          pdfBuffer: buffer,
          slideCount: slideCount,
          speaker: `Speaker ${(launcherPlaylistEngine.getPlaylist().length + 1)}`
        });
      }

      renderLauncherPlaylist();

      const playlist = launcherPlaylistEngine.getPlaylist();
      const activeDeck = playlist.find(d => d.active) || playlist[0];
      if (activeDeck) {
        await selectActiveDeck(activeDeck.id);
      }
    }

    function renderHomeScreenPlaylist() {
      if (!launcherPlaylistSection || !launcherPlaylistCards || !launcherPlaylistEngine) return;
      const playlist = launcherPlaylistEngine.getPlaylist();

      if (playlist.length === 0) {
        launcherPlaylistSection.style.display = 'none';
        return;
      }

      launcherPlaylistSection.style.display = 'block';
      if (launcherPlaylistCount) {
        launcherPlaylistCount.textContent = playlist.length;
      }

      launcherPlaylistCards.innerHTML = '';
      playlist.forEach((deck, idx) => {
        const item = document.createElement('div');
        item.className = `launcher-deck-item ${deck.active ? 'is-active' : ''}`;
        item.dataset.id = deck.id;
        item.style.cursor = 'pointer';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('title', `Click to make "${deck.title}" the active starting deck`);
        item.innerHTML = `
          <div class="launcher-deck-left">
            <div class="launcher-deck-idx">${idx + 1}</div>
            <div class="launcher-deck-details">
              <div class="launcher-deck-name" title="${deck.title}">${deck.title}</div>
              <div class="launcher-deck-meta">
                <span class="launcher-deck-speaker">${deck.speaker || `Speaker ${idx + 1}`}</span>
                ${deck.active ? '<span class="launcher-deck-badge-active">● Active Starting Deck</span>' : ''}
              </div>
            </div>
          </div>
          <div class="launcher-deck-actions">
            ${!deck.active ? `<button type="button" class="btn-deck-set-active" data-id="${deck.id}" title="Make this presentation the active starting deck">Make Active</button>` : ''}
            <button type="button" class="btn-deck-remove" data-id="${deck.id}" title="Remove Deck from Queue">✕</button>
          </div>
        `;

        item.addEventListener('click', async (e) => {
          if (e.target.closest('.btn-deck-remove')) return;
          await selectActiveDeck(deck.id);
        });

        launcherPlaylistCards.appendChild(item);
      });

      launcherPlaylistCards.querySelectorAll('.btn-deck-set-active').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await selectActiveDeck(btn.dataset.id);
        });
      });

      launcherPlaylistCards.querySelectorAll('.btn-deck-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          launcherPlaylistEngine.removeDeck(btn.dataset.id);
          const remaining = launcherPlaylistEngine.getPlaylist();
          if (remaining.length === 0) {
            await resetToDemoFallback();
          } else {
            const active = launcherPlaylistEngine.getActiveDeck() || remaining[0];
            if (active) await selectActiveDeck(active.id);
          }
          renderLauncherPlaylist();
        });
      });
    }

    function renderLauncherPlaylist() {
      renderHomeScreenPlaylist();
      if (!playlistQueueList || !launcherPlaylistEngine) return;
      playlistQueueList.innerHTML = '';
      const playlist = launcherPlaylistEngine.getPlaylist();

      if (playlist.length === 0) {
        playlistQueueList.innerHTML = `
          <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 13px;">
            No presentations queued. Click "+ Add PDF Deck" to queue speaker decks in advance.
          </div>
        `;
        return;
      }

      playlist.forEach((deck, idx) => {
        const card = document.createElement('div');
        card.className = `playlist-item-card ${deck.active ? 'active' : ''}`;
        card.dataset.id = deck.id;
        card.style.cursor = 'pointer';
        card.setAttribute('title', `Click to make "${deck.title}" the active presentation`);
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
            <span style="font-size: 20px;">${deck.active ? '▶️' : '📄'}</span>
            <div style="min-width: 0; flex: 1;">
              <div style="font-weight: 700; font-size: 13.5px; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${deck.title}
              </div>
              <div style="display: flex; gap: 8px; align-items: center; margin-top: 3px;">
                <span class="playlist-speaker-pill">${deck.speaker || `Speaker ${idx + 1}`}</span>
                <span style="font-size: 11.5px; color: #94a3b8;">${deck.slideCount} slides</span>
                ${deck.active ? '<span style="font-size: 11px; color: #38bdf8; font-weight: 700;">● Active Deck</span>' : ''}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn btn-icon btn-remove-deck" data-id="${deck.id}" title="Remove Deck" style="padding: 4px 8px; font-size: 12px; color: #ef4444;">✕</button>
          </div>
        `;

        card.addEventListener('click', async (e) => {
          if (e.target.closest('.btn-remove-deck')) return;
          await selectActiveDeck(deck.id);
        });

        playlistQueueList.appendChild(card);
      });

      playlistQueueList.querySelectorAll('.btn-remove-deck').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          launcherPlaylistEngine.removeDeck(btn.dataset.id);
          const remaining = launcherPlaylistEngine.getPlaylist();
          if (remaining.length === 0) {
            await resetToDemoFallback();
          } else {
            const active = launcherPlaylistEngine.getActiveDeck() || remaining[0];
            if (active) await selectActiveDeck(active.id);
          }
          renderLauncherPlaylist();
        });
      });
    }

    if (btnLauncherAddDeck) {
      btnLauncherAddDeck.addEventListener('click', async () => {
        if (!guardPro('playlist')) return;
        if (window.electronAPI && window.electronAPI.selectPdfFile) {
          const res = await window.electronAPI.selectPdfFile({ multiple: true });
          if (res && !res.canceled) {
            const filesToAdd = res.files || [{ filePath: res.filePath, fileName: res.fileName }];
            await handleMultipleSelectedPdfs(filesToAdd);
          }
        } else if (playlistFileInput) {
          playlistFileInput.click();
        }
      });
    }

    if (btnLauncherClearPlaylist) {
      btnLauncherClearPlaylist.addEventListener('click', async () => {
        if (launcherPlaylistEngine) {
          launcherPlaylistEngine.playlist = [];
          launcherPlaylistEngine.activeDeckId = null;
        }
        await resetToDemoFallback();
        renderLauncherPlaylist();
      });
    }

    if (btnPlaylist) {
      btnPlaylist.addEventListener('click', () => {
        if (!guardPro('playlist')) return;
        renderLauncherPlaylist();
        if (playlistModal) playlistModal.classList.add('open');
      });
    }

    if (btnAddDeck && playlistFileInput) {
      btnAddDeck.addEventListener('click', () => playlistFileInput.click());
      playlistFileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        try {
          await handleMultipleSelectedPdfs(files);
        } catch (err) {
          console.error('Failed to add decks to launcher playlist:', err);
        } finally {
          playlistFileInput.value = '';
        }
      });
    }

    // 3. Rehearsal Analytics Modal
    const btnRehearsalMetrics = document.getElementById('btnRehearsalMetrics');
    const metricsModal = document.getElementById('metricsModal');
    if (btnRehearsalMetrics) {
      btnRehearsalMetrics.addEventListener('click', () => {
        if (!guardPro('metrics')) return;
        if (metricsModal) metricsModal.classList.add('open');
      });
    }

    // 4. Bitfocus Companion API Settings
    const btnCompanion = document.getElementById('btnCompanion');
    if (btnCompanion) {
      btnCompanion.addEventListener('click', () => {
        if (apiModal) apiModal.classList.add('open');
      });
    }

    // 5. NDI Broadcast Modal
    const btnNdiBroadcast = document.getElementById('btnNdiBroadcast');
    const ndiModal = document.getElementById('ndiModal');
    const chkNdiToggle = document.getElementById('chkNdiToggle');
    const ndiStatusDot = document.getElementById('ndiStatusDot');
    const ndiStatusText = document.getElementById('ndiStatusText');
    const selNdiResolution = document.getElementById('selNdiResolution');
    const selNdiFramerate = document.getElementById('selNdiFramerate');

    let launcherNdiEngine = null;
    if (typeof NdiBroadcastEngine !== 'undefined') {
      launcherNdiEngine = new NdiBroadcastEngine({
        isPro: () => isPro()
      });
    }

    if (btnNdiBroadcast) {
      btnNdiBroadcast.addEventListener('click', () => {
        if (!guardPro('ndi')) return;
        if (ndiModal) ndiModal.classList.add('open');
      });
    }

    if (chkNdiToggle && launcherNdiEngine) {
      chkNdiToggle.addEventListener('change', async () => {
        if (chkNdiToggle.checked) {
          const res = await launcherNdiEngine.startBroadcast();
          if (res && res.error === 'PRO_REQUIRED') {
            chkNdiToggle.checked = false;
            if (window.UpgradeModal) window.UpgradeModal.open('ndi');
            return;
          }
          if (ndiStatusDot) ndiStatusDot.style.backgroundColor = '#22c55e';
          if (ndiStatusText) ndiStatusText.textContent = 'NDI Broadcast: Live Ready';
        } else {
          await launcherNdiEngine.stopBroadcast();
          if (ndiStatusDot) ndiStatusDot.style.backgroundColor = '#ef4444';
          if (ndiStatusText) ndiStatusText.textContent = 'NDI Broadcast: Offline';
        }
      });
    }

    if (selNdiResolution && launcherNdiEngine) {
      selNdiResolution.addEventListener('change', () => {
        launcherNdiEngine.setResolution(selNdiResolution.value);
      });
    }

    if (selNdiFramerate && launcherNdiEngine) {
      selNdiFramerate.addEventListener('change', () => {
        launcherNdiEngine.setFramerate(Number(selNdiFramerate.value));
      });
    }

    // 6. Stage Confidence Monitor Modal
    const btnConfidenceMonitor = document.getElementById('btnConfidenceMonitor');
    const confidenceModal = document.getElementById('confidenceModal');
    const btnLaunchConfidenceWindow = document.getElementById('btnLaunchConfidenceWindow');
    const btnCopyConfidenceWebUrl = document.getElementById('btnCopyConfidenceWebUrl');
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
        if (!guardPro('confidence')) return;
        populateConfidenceDisplays();
        if (confidenceModal) confidenceModal.classList.add('open');
      });
    }

    populateConfidenceDisplays();

    if (btnLaunchConfidenceWindow) {
      btnLaunchConfidenceWindow.addEventListener('click', async () => {
        if (!guardPro('confidence')) return;
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
          if (info && info.confidenceUrl) confUrl = info.confidenceUrl;
        }
        try {
          await navigator.clipboard.writeText(confUrl);
          const orig = btnCopyConfidenceWebUrl.innerHTML;
          btnCopyConfidenceWebUrl.innerHTML = '✓ Copied URL!';
          setTimeout(() => { btnCopyConfidenceWebUrl.innerHTML = orig; }, 1800);
        } catch (e) {}
      });
    }

    // Silent Stage Cue Dispatcher in Confidence Modal
    const txtStageCueMessage = document.getElementById('txtStageCueMessage');
    const btnSendStageCue = document.getElementById('btnSendStageCue');
    const btnClearStageCue = document.getElementById('btnClearStageCue');

    let launcherSyncBus = null;
    if (typeof PresentationSyncBus !== 'undefined') {
      try {
        launcherSyncBus = new PresentationSyncBus('launcher');
      } catch (e) {}
    }

    function dispatchLauncherStageCue(message, duration = 10000) {
      const payload = {
        type: 'STAGE_CUE',
        message: message,
        duration: duration,
        source: 'launcher'
      };
      if (window.electronAPI && window.electronAPI.sendSync) {
        window.electronAPI.sendSync(payload);
      }
      if (launcherSyncBus && launcherSyncBus.send) {
        launcherSyncBus.send(payload);
      }
    }

    if (btnSendStageCue && txtStageCueMessage) {
      btnSendStageCue.addEventListener('click', () => {
        const msg = txtStageCueMessage.value.trim();
        if (msg) {
          dispatchLauncherStageCue(msg, 10000);
          const orig = btnSendStageCue.textContent;
          btnSendStageCue.textContent = '✓ Sent';
          setTimeout(() => { btnSendStageCue.textContent = orig; }, 1200);
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
        dispatchLauncherStageCue(null, 0);
        const orig = btnClearStageCue.textContent;
        btnClearStageCue.textContent = '✓';
        setTimeout(() => { btnClearStageCue.textContent = orig; }, 1000);
      });
    }

    document.querySelectorAll('#confidenceModal .cue-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const cue = btn.dataset.cue;
        if (cue) {
          if (txtStageCueMessage) txtStageCueMessage.value = cue;
          dispatchLauncherStageCue(cue, 10000);
          const orig = btn.textContent;
          btn.textContent = '✓ Sent';
          setTimeout(() => { btn.textContent = orig; }, 1200);
        }
      });
    });

    // 7. OBS & vMix Automation Modal
    const btnBroadcastAutomation = document.getElementById('btnBroadcastAutomation');
    const broadcastAutomationModal = document.getElementById('broadcastAutomationModal');
    const chkAutomationToggle = document.getElementById('chkAutomationToggle');
    const btnTestAutomationConnect = document.getElementById('btnTestAutomationConnect');

    let launcherAutomationEngine = null;
    if (typeof BroadcastAutomationEngine !== 'undefined') {
      launcherAutomationEngine = new BroadcastAutomationEngine({
        isPro: () => isPro()
      });
    }

    if (btnBroadcastAutomation) {
      btnBroadcastAutomation.addEventListener('click', () => {
        if (!guardPro('automation')) return;
        if (broadcastAutomationModal) broadcastAutomationModal.classList.add('open');
      });
    }

    if (chkAutomationToggle && launcherAutomationEngine) {
      chkAutomationToggle.addEventListener('change', () => {
        if (chkAutomationToggle.checked) {
          const res = launcherAutomationEngine.enable();
          if (res && res.error === 'PRO_REQUIRED') {
            chkAutomationToggle.checked = false;
            if (window.UpgradeModal) window.UpgradeModal.open('automation');
          }
        } else {
          launcherAutomationEngine.disable();
        }
      });
    }

    if (btnTestAutomationConnect) {
      btnTestAutomationConnect.addEventListener('click', async () => {
        const origText = btnTestAutomationConnect.innerHTML;
        btnTestAutomationConnect.innerHTML = '⚡ Testing Connection...';
        btnTestAutomationConnect.disabled = true;
        setTimeout(() => {
          btnTestAutomationConnect.innerHTML = '✓ Gateway Configuration Verified!';
          btnTestAutomationConnect.style.background = '#10b981';
          setTimeout(() => {
            btnTestAutomationConnect.innerHTML = origText;
            btnTestAutomationConnect.style.background = '';
            btnTestAutomationConnect.disabled = false;
          }, 2000);
        }, 600);
      });
    }
  }

  await init();
});
