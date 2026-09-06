const { app, BrowserWindow, screen, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { generateCompanionConfig } = require('./js/companion-presets.js');

// Global Process Error Boundaries (Google/Microsoft Enterprise Stability)
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED PROMISE REJECTION]', reason);
});

// Remove default Chromium menu bar (File/Edit/View) across all windows
Menu.setApplicationMenu(null);

// Stability flags for Chromium Network Service & GPU on Windows
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// Global Window References
let launcherWindow = null;
let presenterWindow = null;
let audienceWindow = null;

// Presentation State
const state = {
  currentPage: 1,
  totalPages: 6,
  documentTitle: 'Interactive Presentation Showcase.pdf',
  blankMode: 'none',
  timerSeconds: 0,
  timerRunning: false,
  laserActive: false,
  audienceConnected: false,
  presenterConnected: false,
  lastUpdated: Date.now()
};

let currentPdfConfig = {
  isDemo: true,
  title: 'Interactive Presentation Showcase.pdf',
  filePath: null,
  totalPages: 6
};

// Active PDF storage in memory for zero-latency localhost HTTP streaming
let activePdfBuffer = null;
let activePdfPath = null;

// ===========================================================================
// 1. EMBEDDED BITFOCUS COMPANION REST API & WEBSOCKET SERVER
// ===========================================================================
const wsClients = new Set();
let timerInterval = null;
let companionServer = null;
let isApiServerRunning = false;
let apiServerError = null;

function getConfigFilePath() {
  try {
    return path.join(app.getPath('userData'), 'api-settings.json');
  } catch (e) {
    return path.join(__dirname, '.api-settings.json');
  }
}

let apiSettings = {
  enabled: true,
  host: '0.0.0.0',
  port: 3000
};

function loadApiSettings() {
  try {
    const cfgFile = getConfigFilePath();
    if (fs.existsSync(cfgFile)) {
      const data = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      if (typeof data.enabled === 'boolean') apiSettings.enabled = data.enabled;
      if (typeof data.host === 'string' && data.host.trim()) apiSettings.host = data.host.trim();
      if (typeof data.port === 'number' && data.port >= 1024 && data.port <= 65535) apiSettings.port = data.port;
    }
  } catch (e) {
    console.warn('[API Config] Error loading api-settings.json:', e.message);
  }
  return apiSettings;
}

function saveApiSettings() {
  try {
    const cfgFile = getConfigFilePath();
    fs.writeFileSync(cfgFile, JSON.stringify(apiSettings, null, 2), 'utf8');
  } catch (e) {
    console.warn('[API Config] Error saving api-settings.json:', e.message);
  }
}

function startServerTimer() {
  if (!state.timerRunning) {
    state.timerRunning = true;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (state.timerRunning) {
        state.timerSeconds++;
        broadcastState('TIMER_TICK');
      }
    }, 1000);
  }
}
function pauseServerTimer() {
  state.timerRunning = false;
  if (timerInterval) clearInterval(timerInterval);
}
function resetServerTimer() {
  state.timerSeconds = 0;
  broadcastState('TIMER_RESET');
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

function getNetworkInterfacesInfo() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({
          name: name,
          address: iface.address
        });
      }
    }
  }
  return list;
}

function getActiveApiUrl() {
  if (!isApiServerRunning) return null;
  const host = apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host;
  return `http://${host}:${apiSettings.port}/api/`;
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getPublicState() {
  return {
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    progressPercent: state.totalPages > 0 ? Math.round((state.currentPage / state.totalPages) * 1000) / 10 : 0,
    documentTitle: state.documentTitle,
    blankMode: state.blankMode,
    timerSeconds: state.timerSeconds,
    timerFormatted: formatTime(state.timerSeconds),
    timerRunning: state.timerRunning,
    laserActive: state.laserActive,
    audienceConnected: !!audienceWindow && !audienceWindow.isDestroyed(),
    presenterConnected: !!presenterWindow && !presenterWindow.isDestroyed(),
    lastUpdated: state.lastUpdated
  };
}

function broadcastState(actionSource = 'STATE_UPDATE') {
  state.lastUpdated = Date.now();
  const payload = JSON.stringify({ type: 'STATE_SYNC', source: actionSource, state: getPublicState() });
  const frame = encodeWsFrame(payload);
  for (const client of wsClients) {
    try { if (client.writable) client.write(frame); } catch (e) { wsClients.delete(client); }
  }
}

function encodeWsFrame(payload) {
  const buf = Buffer.from(payload, 'utf8');
  const length = buf.length;
  let header;
  if (length <= 125) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = length;
  } else if (length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, buf]);
}

function stopCompanionServer() {
  return new Promise((resolve) => {
    for (const client of wsClients) {
      try { client.destroy(); } catch (e) {}
    }
    wsClients.clear();

    if (companionServer) {
      try {
        if (typeof companionServer.closeAllConnections === 'function') {
          companionServer.closeAllConnections();
        }
        companionServer.close(() => {
          companionServer = null;
          isApiServerRunning = false;
          apiServerError = null;
          console.log('[PDF Server] Stopped cleanly.');
          resolve();
        });
        return;
      } catch (err) {
        companionServer = null;
        isApiServerRunning = false;
        resolve();
        return;
      }
    }
    isApiServerRunning = false;
    apiServerError = null;
    resolve();
  });
}

function startCompanionServer(host = apiSettings.host, port = apiSettings.port) {
  return new Promise((resolve) => {
    if (!apiSettings.enabled) {
      isApiServerRunning = false;
      apiServerError = null;
      resolve({ success: true, running: false, error: null });
      return;
    }

    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const pathname = parsedUrl.pathname;

      // Origin validation: Protect against malicious external websites attempting CSRF/SSRF
      const origin = req.headers['origin'];
      const isAllowedOrigin = !origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') || 
        origin.startsWith('vscode-webview://') ||
        origin.startsWith('file://');

      if (origin && !isAllowedOrigin) {
        console.warn(`[Security Alert] Blocked cross-origin request from unauthorized origin: ${origin}`);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cross-Origin Forbidden: External browser sites cannot control PDF Presenter Suite' }));
        return;
      }

      if (origin && isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*'); // For non-browser clients (Bitfocus Companion, hardware clickers)
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // --- 1. STREAM CURRENT ACTIVE PDF FILE DIRECTLY (ZERO BASE64 OVERHEAD) ---
      if (pathname === '/api/document/current.pdf') {
        if (activePdfBuffer) {
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': activePdfBuffer.length,
            'Accept-Ranges': 'bytes'
          });
          res.end(activePdfBuffer);
          return;
        } else if (activePdfPath && fs.existsSync(activePdfPath)) {
          const stat = fs.statSync(activePdfPath);
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes'
          });
          fs.createReadStream(activePdfPath).pipe(res);
          return;
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('No active PDF loaded');
          return;
        }
      }

      // --- 2. COMPANION REST API ENDPOINTS ---
      if (pathname.startsWith('/api/')) {
        handleCompanionApi(req, res, pathname, parsedUrl.query);
        return;
      }

      // --- 3. STATIC FILES SERVING ---
      let relativePath = pathname === '/' ? 'views/launcher.html' : pathname;
      if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
      const filePath = path.join(__dirname, relativePath);

      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          fs.readFile(filePath, (err2, content) => {
            if (!err2) {
              const ext = path.extname(filePath).toLowerCase();
              const mime = ext === '.html' ? 'text/html; charset=utf-8' :
                           ext === '.js' ? 'application/javascript; charset=utf-8' :
                           ext === '.css' ? 'text/css; charset=utf-8' :
                           ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
              res.writeHead(200, { 'Content-Type': mime });
              res.end(content);
              return;
            }
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });
    });

    server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) { socket.destroy(); return; }
      const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`].join('\r\n') + '\r\n\r\n');
      wsClients.add(socket);
      socket.on('close', () => wsClients.delete(socket));
      socket.on('error', () => wsClients.delete(socket));
    });

    server.on('error', (err) => {
      console.error('[Companion Server Error]', err.message);
      apiServerError = err.code === 'EADDRINUSE' ? `Port ${port} is already in use by another program.` : err.message;
      isApiServerRunning = false;
      companionServer = null;
      resolve({ success: false, running: false, error: apiServerError, port: port, host: host });
    });

    try {
      server.listen(port, host, () => {
        companionServer = server;
        isApiServerRunning = true;
        apiServerError = null;
        console.log(`[PDF Server & Companion Hub] Running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/api/`);
        resolve({ success: true, running: true, error: null, port: port, host: host });
      });
    } catch (err) {
      apiServerError = err.message;
      isApiServerRunning = false;
      companionServer = null;
      resolve({ success: false, running: false, error: err.message, port: port, host: host });
    }
  });
}

async function restartCompanionServer(newSettings) {
  if (newSettings) {
    if (typeof newSettings.enabled === 'boolean') apiSettings.enabled = newSettings.enabled;
    if (typeof newSettings.host === 'string' && newSettings.host.trim()) apiSettings.host = newSettings.host.trim();
    if (newSettings.port) {
      const p = parseInt(newSettings.port, 10);
      if (!isNaN(p) && p >= 1024 && p <= 65535) {
        apiSettings.port = p;
      }
    }
    saveApiSettings();
  }

  await stopCompanionServer();

  if (apiSettings.enabled) {
    return await startCompanionServer(apiSettings.host, apiSettings.port);
  } else {
    return { success: true, running: false, error: null, host: apiSettings.host, port: apiSettings.port };
  }
}

function handleCompanionApi(req, res, pathname, query) {
  const jsonResponse = (data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  };

  const action = pathname.replace('/api/', '').toLowerCase();

  switch (action) {
    case 'status':
    case 'state':
      return jsonResponse(getPublicState());

    case 'next':
      if (state.currentPage < state.totalPages) {
        state.currentPage++;
        relaySyncEvent({ type: 'GOTO_PAGE', page: state.currentPage, source: 'companion_api' });
        broadcastState('API_NEXT');
      }
      return jsonResponse({ success: true, message: 'Advanced to next slide', state: getPublicState() });

    case 'prev':
    case 'previous':
      if (state.currentPage > 1) {
        state.currentPage--;
        relaySyncEvent({ type: 'GOTO_PAGE', page: state.currentPage, source: 'companion_api' });
        broadcastState('API_PREV');
      }
      return jsonResponse({ success: true, message: 'Returned to previous slide', state: getPublicState() });

    case 'first':
      state.currentPage = 1;
      relaySyncEvent({ type: 'GOTO_PAGE', page: 1, source: 'companion_api' });
      broadcastState('API_FIRST');
      return jsonResponse({ success: true, state: getPublicState() });

    case 'last':
      state.currentPage = state.totalPages;
      relaySyncEvent({ type: 'GOTO_PAGE', page: state.totalPages, source: 'companion_api' });
      broadcastState('API_LAST');
      return jsonResponse({ success: true, state: getPublicState() });

    case 'goto':
      const targetPage = Number(query.page || 1);
      if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= state.totalPages) {
        state.currentPage = targetPage;
        relaySyncEvent({ type: 'GOTO_PAGE', page: targetPage, source: 'companion_api' });
        broadcastState('API_GOTO');
        return jsonResponse({ success: true, state: getPublicState() });
      }
      return jsonResponse({ error: 'Invalid page' }, 400);

    case 'blackout':
      state.blankMode = state.blankMode === 'black' ? 'none' : 'black';
      relaySyncEvent({ type: 'SET_BLANK', mode: state.blankMode, source: 'companion_api' });
      broadcastState('API_BLACKOUT');
      return jsonResponse({ success: true, blankMode: state.blankMode, state: getPublicState() });

    case 'whiteout':
      state.blankMode = state.blankMode === 'white' ? 'none' : 'white';
      relaySyncEvent({ type: 'SET_BLANK', mode: state.blankMode, source: 'companion_api' });
      broadcastState('API_WHITEOUT');
      return jsonResponse({ success: true, blankMode: state.blankMode, state: getPublicState() });

    case 'timer/start':
      startServerTimer();
      relaySyncEvent({ type: 'TIMER_CONTROL', action: 'start' });
      return jsonResponse({ success: true, state: getPublicState() });

    case 'timer/pause':
      pauseServerTimer();
      relaySyncEvent({ type: 'TIMER_CONTROL', action: 'pause' });
      return jsonResponse({ success: true, state: getPublicState() });

    case 'timer/reset':
      resetServerTimer();
      relaySyncEvent({ type: 'TIMER_CONTROL', action: 'reset' });
      return jsonResponse({ success: true, state: getPublicState() });

    case 'info':
      return jsonResponse({
        enabled: apiSettings.enabled,
        serverRunning: isApiServerRunning,
        serverPort: apiSettings.port,
        serverHost: apiSettings.host,
        localIPs: getLocalIPs(),
        companionApiUrl: getActiveApiUrl()
      });

    default:
      return jsonResponse({ error: 'Unknown endpoint' }, 404);
  }
}

// ===========================================================================
// 2. WINDOW CREATION & LIFECYCLE MANAGEMENT
// ===========================================================================

// Secure Window Helper: Disables keyboard inspection shortcuts in production
function secureWindow(win) {
  if (!win) return;
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'r') ||
        (input.control && input.key.toLowerCase() === 'r')
      ) {
        event.preventDefault();
      }
    });
  }
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 1060,
    height: 780,
    minWidth: 880,
    minHeight: 620,
    backgroundColor: '#0a0e1a',
    title: 'PDF Presenter Suite - Setup & Display Launcher',
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  secureWindow(launcherWindow);
  launcherWindow.loadFile(path.join(__dirname, 'views/launcher.html'));

  launcherWindow.on('closed', () => {
    launcherWindow = null;
    if (!presenterWindow && !audienceWindow) {
      app.quit();
    }
  });
}

function startPresentationWindows(config) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  const presenterDisplay = displays.find(d => String(d.id) === String(config.presenterDisplayId)) || primaryDisplay;
  const audienceDisplay = displays.find(d => String(d.id) === String(config.audienceDisplayId)) || (displays.length > 1 ? displays.find(d => d.id !== presenterDisplay.id) : primaryDisplay);

  const isSingleDisplay = displays.length <= 1 || String(presenterDisplay.id) === String(audienceDisplay.id);

  console.log(`[Presentation Launch] Presenter Display: ${presenterDisplay.id} (${presenterDisplay.bounds.width}x${presenterDisplay.bounds.height})`);
  console.log(`[Presentation Launch] Audience Display: ${audienceDisplay.id} (${audienceDisplay.bounds.width}x${audienceDisplay.bounds.height})`);

  // Ensure active PDF path is set or cleared for demo mode
  if (config.isDemo) {
    activePdfPath = null;
    activePdfBuffer = null;
  } else if (config.filePath && fs.existsSync(config.filePath)) {
    activePdfPath = config.filePath;
    activePdfBuffer = null; // Stream directly from file
  }

  currentPdfConfig = {
    isDemo: Boolean(config.isDemo),
    title: config.title || 'Presentation.pdf',
    filePath: config.filePath || null,
    totalPages: config.totalPages || 6,
    transitionDuration: typeof config.transitionDuration === 'number' ? config.transitionDuration : 1.0,
    transitionStyle: config.transitionStyle || 'crossfade'
  };

  state.documentTitle = currentPdfConfig.title;
  state.totalPages = currentPdfConfig.totalPages;
  state.currentPage = 1;
  state.blankMode = 'none';

  // 1. Create Audience Window
  if (!isSingleDisplay && config.fullscreen) {
    // Multi-Screen: Place precisely on external display bounds
    audienceWindow = new BrowserWindow({
      x: audienceDisplay.bounds.x,
      y: audienceDisplay.bounds.y,
      width: audienceDisplay.bounds.width,
      height: audienceDisplay.bounds.height,
      frame: false,
      show: true,
      alwaysOnTop: config.alwaysOnTop || false,
      backgroundColor: '#000000',
      title: 'PDF Presenter - Audience Display',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        devTools: !app.isPackaged
      }
    });

    audienceWindow.setBounds({
      x: audienceDisplay.bounds.x,
      y: audienceDisplay.bounds.y,
      width: audienceDisplay.bounds.width,
      height: audienceDisplay.bounds.height
    });

    audienceWindow.setFullScreen(true);
  } else {
    // Single Display or Windowed Preview: Side-by-side preview window
    audienceWindow = new BrowserWindow({
      x: audienceDisplay.bounds.x + (isSingleDisplay ? 250 : 50),
      y: audienceDisplay.bounds.y + (isSingleDisplay ? 150 : 50),
      width: 960,
      height: 540,
      frame: true,
      fullscreen: false,
      show: true,
      alwaysOnTop: false,
      backgroundColor: '#000000',
      title: 'PDF Presenter - Audience Display (Second Screen Preview)',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        devTools: !app.isPackaged
      }
    });
  }

  secureWindow(audienceWindow);
  audienceWindow.loadFile(path.join(__dirname, 'views/audience.html'));
  audienceWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Audience Console] ${message}`);
  });

  // 2. Create Presenter Cockpit Window
  presenterWindow = new BrowserWindow({
    x: presenterDisplay.bounds.x,
    y: presenterDisplay.bounds.y,
    width: presenterDisplay.workArea.width,
    height: presenterDisplay.workArea.height,
    show: true,
    backgroundColor: '#0a0e1a',
    title: 'PDF Presenter - Presenter Cockpit',
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  secureWindow(presenterWindow);
  presenterWindow.loadFile(path.join(__dirname, 'views/presenter.html'));
  presenterWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Presenter Console] ${message}`);
  });

  // Automatically maximize Presenter Window so it cleanly covers 100% of the screen
  presenterWindow.maximize();
  presenterWindow.focus();

  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.hide();
  }

  audienceWindow.on('closed', () => {
    audienceWindow = null;
  });

  presenterWindow.on('closed', () => {
    presenterWindow = null;
    endPresentation();
  });
}

function endPresentation() {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.close();
    audienceWindow = null;
  }
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.close();
    presenterWindow = null;
  }

  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    launcherWindow.webContents.send('presentation-ended');
  } else {
    createLauncherWindow();
  }
}

function relaySyncEvent(data) {
  console.log(`[IPC Relay] ${data.type} (page: ${data.page || state.currentPage})`);
  if (data.type === 'PAGE_CHANGED' || data.type === 'GOTO_PAGE') {
    state.currentPage = Number(data.page || state.currentPage);
  }
  if (data.type === 'SET_BLANK') {
    state.blankMode = data.mode;
  }

  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.webContents.send('sync-event', data);
  }

  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('sync-event', data);
  }

  broadcastState('IPC_SYNC');
}

// ===========================================================================
// 3. IPC HANDLERS
// ===========================================================================

ipcMain.handle('get-displays', () => {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  return displays.map((d, index) => {
    const isPrimary = d.id === primary.id;
    const res = `${d.bounds.width}x${d.bounds.height}`;
    let label = d.label || `Display ${index + 1}`;
    if (!d.label) {
      label = isPrimary ? `Built-in Screen (${res})` : `External Display (${res})`;
    }
    return {
      id: d.id,
      label: label,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
      isPrimary: isPrimary,
      isInternal: d.internal || isPrimary
    };
  });
});

ipcMain.handle('select-pdf-file', async () => {
  const result = await dialog.showOpenDialog(launcherWindow || presenterWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  
  // Cache active file path for HTTP streaming and direct memory buffer
  activePdfPath = filePath;
  activePdfBuffer = null;

  let bufferData = null;
  try {
    bufferData = fs.readFileSync(filePath);
  } catch (err) {
    console.warn('[PDF Read Error]', err.message);
  }

  return {
    canceled: false,
    filePath: filePath,
    fileName: fileName,
    streamUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/api/document/current.pdf` : null,
    pdfData: bufferData ? bufferData.buffer.slice(bufferData.byteOffset, bufferData.byteOffset + bufferData.byteLength) : null
  };
});

ipcMain.handle('load-recent-pdf', (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    activePdfPath = filePath;
    activePdfBuffer = null;

    let bufferData = null;
    try {
      bufferData = fs.readFileSync(filePath);
    } catch (err) {
      console.warn('[PDF Read Error]', err.message);
    }

    return {
      success: true,
      filePath: filePath,
      fileName: path.basename(filePath),
      streamUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/api/document/current.pdf?t=${Date.now()}` : null,
      pdfData: bufferData ? bufferData.buffer.slice(bufferData.byteOffset, bufferData.byteOffset + bufferData.byteLength) : null
    };
  }
  return { success: false, error: 'File not found on disk' };
});

ipcMain.handle('set-active-pdf-buffer', (event, { fileName, buffer }) => {
  activePdfBuffer = Buffer.from(buffer);
  activePdfPath = null;
  return {
    success: true,
    streamUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/api/document/current.pdf` : null
  };
});

ipcMain.handle('start-presentation', (event, config) => {
  startPresentationWindows(config);
  return { success: true };
});

ipcMain.handle('end-presentation', () => {
  endPresentation();
  return { success: true };
});

ipcMain.handle('get-presentation-data', () => {
  let bufferData = null;
  if (activePdfBuffer) {
    bufferData = activePdfBuffer;
  } else if (activePdfPath && fs.existsSync(activePdfPath)) {
    try {
      bufferData = fs.readFileSync(activePdfPath);
    } catch (err) {
      console.warn('[PDF Read Error]', err.message);
    }
  }

  return {
    config: currentPdfConfig,
    streamUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/api/document/current.pdf` : null,
    pdfData: bufferData ? bufferData.buffer.slice(bufferData.byteOffset, bufferData.byteOffset + bufferData.byteLength) : null,
    state: getPublicState()
  };
});

ipcMain.handle('get-companion-info', () => {
  return {
    enabled: apiSettings.enabled,
    running: isApiServerRunning,
    port: apiSettings.port,
    host: apiSettings.host,
    localIPs: getLocalIPs(),
    companionApiUrl: getActiveApiUrl(),
    endpoints: [
      { path: '/api/next', desc: 'Advance slide' },
      { path: '/api/prev', desc: 'Previous slide' },
      { path: '/api/first', desc: 'First slide' },
      { path: '/api/last', desc: 'Last slide' },
      { path: '/api/goto?page=N', desc: 'Go to slide N' },
      { path: '/api/blackout', desc: 'Toggle blackout' },
      { path: '/api/whiteout', desc: 'Toggle whiteout' },
      { path: '/api/timer/start', desc: 'Start timer' },
      { path: '/api/timer/pause', desc: 'Pause timer' },
      { path: '/api/status', desc: 'Get live state JSON' }
    ]
  };
});

ipcMain.handle('get-api-config', () => {
  return {
    enabled: apiSettings.enabled,
    host: apiSettings.host,
    port: apiSettings.port,
    isRunning: isApiServerRunning,
    error: apiServerError,
    localIPs: getLocalIPs(),
    interfaces: getNetworkInterfacesInfo(),
    activeUrl: getActiveApiUrl()
  };
});

ipcMain.handle('update-api-config', async (event, newConfig) => {
  const result = await restartCompanionServer(newConfig);
  return {
    ...result,
    enabled: apiSettings.enabled,
    host: apiSettings.host,
    port: apiSettings.port,
    isRunning: isApiServerRunning,
    error: apiServerError,
    localIPs: getLocalIPs(),
    interfaces: getNetworkInterfacesInfo(),
    activeUrl: getActiveApiUrl()
  };
});

ipcMain.handle('open-external', (event, targetUrl) => {
  if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('mailto:'))) {
    shell.openExternal(targetUrl);
  }
  return { success: true };
});

ipcMain.handle('toggle-presenter-fullscreen', () => {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    const isFS = presenterWindow.isFullScreen();
    presenterWindow.setFullScreen(!isFS);
    return { isFullScreen: !isFS };
  }
  return { isFullScreen: false };
});

ipcMain.on('sync-event', (event, data) => {
  relaySyncEvent(data);
});

// Semantic Version Parser & Comparator
function parseSemver(v) {
  if (!v) return [0, 0, 0];
  const cleaned = v.replace(/^v/, '').trim();
  return cleaned.split('.').map(num => parseInt(num, 10) || 0);
}

function isNewerVersion(latest, current) {
  const [lMaj, lMin, lPat] = parseSemver(latest);
  const [cMaj, cMin, cPat] = parseSemver(current);
  if (lMaj > cMaj) return true;
  if (lMaj === cMaj && lMin > cMin) return true;
  if (lMaj === cMaj && lMin === cMin && lPat > cPat) return true;
  return false;
}

function fetchLatestGithubRelease() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/SHARUNJOSEPH/pdf-presenter/releases/latest',
      headers: {
        'User-Agent': `PDF-Presenter-Suite/${app.getVersion()}`
      },
      timeout: 5000
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const release = JSON.parse(data);
            resolve({ success: true, release });
          } else {
            resolve({ success: false, status: res.statusCode });
          }
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
  });
}

// GitHub Releases Update Checker IPC Handler
ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion();
  const isStore = Boolean(process.windowsStore);
  if (isStore) {
    return {
      isStore: true,
      hasUpdate: false,
      currentVersion,
      message: 'Updates are managed automatically by the Microsoft Store.'
    };
  }

  const result = await fetchLatestGithubRelease();
  if (!result.success || !result.release) {
    return {
      isStore: false,
      hasUpdate: false,
      currentVersion,
      error: result.error || (result.status === 404 ? 'No public releases published yet' : 'Could not contact update server')
    };
  }

  const latestVersion = (result.release.tag_name || '').replace(/^v/, '');
  const hasUpdate = isNewerVersion(latestVersion, currentVersion);
  return {
    isStore: false,
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseName: result.release.name || `v${latestVersion}`,
    releaseNotes: result.release.body || '',
    releaseUrl: result.release.html_url || 'https://github.com/SHARUNJOSEPH/pdf-presenter/releases'
  };
});

// Bitfocus Companion & Stream Deck Presets Export Handler
ipcMain.handle('export-companion-config', async (event, options = {}) => {
  const host = options.host || (apiSettings.host === '0.0.0.0' ? '127.0.0.1' : apiSettings.host);
  const port = options.port || apiSettings.port;
  const configJson = generateCompanionConfig(host, port);

  if (options.returnJsonOnly) {
    return { success: true, json: configJson };
  }

  const focusedWin = BrowserWindow.getFocusedWindow() || launcherWindow;
  const saveResult = await dialog.showSaveDialog(focusedWin, {
    title: 'Export Bitfocus Companion & Stream Deck Presets',
    defaultPath: 'pdf-presenter-streamdeck.companionconfig',
    filters: [
      { name: 'Companion Configuration', extensions: ['companionconfig', 'json'] }
    ]
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(saveResult.filePath, configJson, 'utf8');
  return {
    success: true,
    filePath: saveResult.filePath
  };
});

// App Lifecycle
app.whenReady().then(async () => {
  loadApiSettings();
  if (apiSettings.enabled) {
    await startCompanionServer(apiSettings.host, apiSettings.port);
  }
  createLauncherWindow();

  // Multi-Screen & Display Hotplug Resilience (Google/Microsoft Enterprise Standard)
  screen.on('display-removed', (event, oldDisplay) => {
    console.warn(`[Display Alert] Display ${oldDisplay.id} was disconnected.`);
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const currentBounds = audienceWindow.getBounds();
      // If audience window was on the removed display, gracefully move it onto primary
      if (currentBounds.x >= oldDisplay.bounds.x && currentBounds.x < oldDisplay.bounds.x + oldDisplay.bounds.width) {
        console.log('[Display Recovery] Gracefully repositioning audience window to primary display.');
        audienceWindow.setBounds({
          x: primaryDisplay.bounds.x + 50,
          y: primaryDisplay.bounds.y + 50,
          width: Math.min(1280, primaryDisplay.bounds.width - 100),
          height: Math.min(720, primaryDisplay.bounds.height - 100)
        });
      }
    }
  });

  screen.on('display-metrics-changed', (event, display, changedMetrics) => {
    console.log(`[Display Metrics Changed] Display ${display.id}: ${changedMetrics ? changedMetrics.join(', ') : 'unknown'}`);
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.webContents.send('display-metrics-changed', { displayId: display.id });
    }
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('display-metrics-changed', { displayId: display.id });
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await stopCompanionServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
