// main.js - Electron Main Process for Dual-Screen Presentation & Companion Hub
const { app, BrowserWindow, screen, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const os = require('os');
const crypto = require('crypto');

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
// 1. EMBEDDED BITFOCUS COMPANION REST API & WEBSOCKET SERVER (PORT 3000)
// ===========================================================================
let COMPANION_PORT = Number(process.env.PORT) || 3000;
const wsClients = new Set();
let timerInterval = null;

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

function setupCompanionServer(initialPort = 3000) {
  let port = Number(process.env.PORT) || initialPort;

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
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
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Port Conflict] Port ${port} is in use. Trying port ${port + 1}...`);
      port++;
      COMPANION_PORT = port;
      server.listen(port, '0.0.0.0');
    } else {
      console.error('[Server Error]', err);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    COMPANION_PORT = port;
    console.log(`[PDF Server & Companion Hub] Running on http://localhost:${COMPANION_PORT}/api/`);
  });
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
        serverPort: COMPANION_PORT,
        localIPs: getLocalIPs(),
        companionApiUrl: `http://localhost:${COMPANION_PORT}/api/`
      });

    default:
      return jsonResponse({ error: 'Unknown endpoint' }, 404);
  }
}

// ===========================================================================
// 2. WINDOW CREATION & LIFECYCLE MANAGEMENT
// ===========================================================================

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
      nodeIntegration: false
    }
  });

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

  // Ensure active PDF path is set
  if (config.filePath && fs.existsSync(config.filePath)) {
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
        nodeIntegration: false
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
        nodeIntegration: false
      }
    });
  }

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
      nodeIntegration: false
    }
  });

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
  
  // Cache active file path for HTTP streaming
  activePdfPath = filePath;
  activePdfBuffer = null;

  return {
    canceled: false,
    filePath: filePath,
    fileName: fileName,
    streamUrl: `http://localhost:${COMPANION_PORT}/api/document/current.pdf`
  };
});

ipcMain.handle('set-active-pdf-buffer', (event, { fileName, buffer }) => {
  activePdfBuffer = Buffer.from(buffer);
  activePdfPath = null;
  return { success: true, streamUrl: `http://localhost:${COMPANION_PORT}/api/document/current.pdf` };
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
  return {
    config: currentPdfConfig,
    streamUrl: `http://localhost:${COMPANION_PORT}/api/document/current.pdf`,
    state: getPublicState()
  };
});

ipcMain.handle('get-companion-info', () => {
  return {
    port: COMPANION_PORT,
    localIPs: getLocalIPs(),
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

// App Lifecycle
app.whenReady().then(() => {
  setupCompanionServer();
  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
