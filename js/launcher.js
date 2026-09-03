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

  // =========================================================================
  // 1. INITIALIZATION & SCREEN ENUMERATION
  // =========================================================================
  async function init() {
    setupEventListeners();
    await loadInitialDemoDeck();
    await detectAndRenderScreens();
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

  async function handleSelectedPdf(filePath, fileName, streamUrl = null) {
    try {
      docMetaTitle.textContent = `Loading ${fileName}...`;
      docMetaPages.textContent = 'Parsing presentation...';

      const url = streamUrl || `http://localhost:3000/api/document/current.pdf?t=${Date.now()}`;
      const docInfo = await engine.loadPDFFromUrl(url, fileName);

      currentDocConfig = {
        isDemo: false,
        title: fileName,
        filePath: filePath,
        totalPages: docInfo.totalPages
      };
      updateDocPreviewUI();
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
  // 3. EVENT LISTENERS
  // =========================================================================
  function setupEventListeners() {
    selectAudienceDisplay.addEventListener('change', updateCardSelectionHighlight);

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
          await handleSelectedPdf(result.filePath, result.fileName, result.streamUrl);
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
        transitionStyle: style
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
  }

  await init();
});
