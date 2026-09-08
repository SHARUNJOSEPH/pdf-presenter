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

  async function detectAndRenderScreens() {
    if (window.electronAPI && window.electronAPI.getDisplays) {
      try {
        connectedDisplays = await window.electronAPI.getDisplays();
        renderScreenTopology(connectedDisplays);
        return;
      } catch (err) {
        console.warn('Electron getDisplays error', err);
      }
    }

    connectedDisplays = [
      { id: 1, label: 'Primary Laptop Screen (1920x1080)', isPrimary: true, bounds: { width: 1920, height: 1080 } },
      { id: 2, label: 'External HDMI Projector (3840x2160)', isPrimary: false, bounds: { width: 3840, height: 2160 } }
    ];
    renderScreenTopology(connectedDisplays);
  }

  function renderScreenTopology(displays) {
    screenCardsList.innerHTML = '';
    selectAudienceDisplay.innerHTML = '';
    selectPresenterDisplay.innerHTML = '';

    displays.forEach((display, index) => {
      const card = document.createElement('div');
      card.className = `screen-card-item ${!display.isPrimary ? 'is-target' : ''}`;
      card.dataset.displayId = display.id;

      const isExt = !display.isPrimary;
      const icon = isExt ? '📽️' : '💻';
      const badge = display.isPrimary ? '<span class="badge" style="color:#38bdf8;">Primary Monitor</span>' : '<span class="badge badge-connected">External Display</span>';

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

      const optAud = document.createElement('option');
      optAud.value = display.id;
      optAud.textContent = `${display.label} (${display.bounds.width}x${display.bounds.height})`;
      if (displays.length > 1 && !display.isPrimary) {
        optAud.selected = true;
      } else if (displays.length === 1) {
        optAud.selected = true;
      }
      selectAudienceDisplay.appendChild(optAud);

      const optPres = document.createElement('option');
      optPres.value = display.id;
      optPres.textContent = `${display.label} (${display.bounds.width}x${display.bounds.height})`;
      if (display.isPrimary) {
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
        totalPages: docInfo.totalPages
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

    // Presentation lifecycle reset listeners
    if (window.electronAPI && window.electronAPI.onPresentationEnded) {
      window.electronAPI.onPresentationEnded(() => {
        resetLaunchButton();
      });
    }
    window.addEventListener('focus', resetLaunchButton);

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
        const result = await window.electronAPI.selectPdfFile();
        if (result && !result.canceled) {
          await handleSelectedPdf(result.filePath, result.fileName, result.streamUrl, result.pdfData);
        }
      } else {
        pdfFileInput.click();
      }
    });

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

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          if (file.path && window.electronAPI && window.electronAPI.startPresentation) {
            // In Electron with file path on disk
            await handleSelectedPdf(file.path, file.name);
          } else {
            // Transfer buffer to main process
            const buffer = await file.arrayBuffer();
            if (window.electronAPI && window.electronAPI.setActivePdfBuffer) {
              const res = await window.electronAPI.setActivePdfBuffer({ fileName: file.name, buffer: Array.from(new Uint8Array(buffer)) });
              await handleSelectedPdf(null, file.name, res.streamUrl);
            } else {
              await engine.loadPDFData(buffer, file.name);
              currentDocConfig = { isDemo: false, title: file.name, filePath: null, totalPages: engine.totalPages };
              updateDocPreviewUI();
            }
          }
        } else {
          alert('Please select a valid .PDF document.');
        }
      }
    });

    btnUseDemo.addEventListener('click', () => {
      resetLaunchButton();
      loadInitialDemoDeck();
    });

    btnStartPresentation.addEventListener('click', async () => {
      const duration = rngTransitionDuration ? parseFloat(rngTransitionDuration.value) : 1.0;
      const style = selectTransitionStyle ? selectTransitionStyle.value : 'crossfade';

      const config = {
        isDemo: currentDocConfig.isDemo,
        title: currentDocConfig.title,
        filePath: currentDocConfig.filePath,
        totalPages: currentDocConfig.totalPages,
        audienceDisplayId: selectAudienceDisplay.value,
        presenterDisplayId: selectPresenterDisplay.value,
        fullscreen: chkFullscreen.checked,
        alwaysOnTop: chkAlwaysOnTop.checked,
        transitionDuration: duration,
        transitionStyle: style,
        companionEnabled: chkApiEnabled ? chkApiEnabled.checked : true
      };

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
  }

  await init();
});
