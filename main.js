const { app, BrowserWindow, screen, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const child_process = require('child_process');
const { generateCompanionConfig } = require('./js/companion-presets.js');
const licenseManager = require('./js/license-manager.js');
const diagnosticsEngine = require('./js/diagnostics-engine.js');

// Aptabase Privacy-Friendly Analytics
let aptabaseTrackEvent = null;
try {
  const { initialize, trackEvent } = require('@aptabase/electron/main');
  initialize('A-US-1170232141');
  aptabaseTrackEvent = trackEvent;
} catch (e) {
  console.warn('[Aptabase] Initialization warning:', e.message);
}

// Enforce Single-Instance Application Lock (Prevents duplicate instances, port 3000 collisions, and crashes)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.warn('[App Startup] Another instance of PDF Presenter Suite is already running. Quitting secondary process.');
  app.quit();
  process.exit(0);
}

// Anti-Debugging: Block dangerous remote inspection flags in production
if (app.isPackaged) {
  const dangerousArgs = ['--remote-debugging-port', '--inspect', '--inspect-brk', '--remote-debugging-targets'];
  for (const arg of dangerousArgs) {
    if (process.argv.some(a => typeof a === 'string' && a.startsWith(arg))) {
      console.warn(`[Security Alert] Dangerous launch argument blocked: ${arg}`);
      app.quit();
      process.exit(1);
    }
  }
}

// Hardware GPU & Compositor Optimization: Prevents dual-screen VSync tearing and canvas texture flickering on Intel/integrated GPUs & hybrid discrete GPUs (NVIDIA RTX / AMD Radeon)
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// Verify core filesystem module integrity
function verifyCoreIntegrity() {
  try {
    const criticalFiles = [
      path.join(__dirname, 'js/license-manager.js'),
      path.join(__dirname, 'preload.js')
    ];
    for (const f of criticalFiles) {
      if (fs.existsSync(f)) {
        const stats = fs.statSync(f);
        if (stats.size === 0) {
          console.warn(`[Integrity Alert] Suspicious zero-byte critical file: ${f}`);
          return false;
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}
verifyCoreIntegrity();

// Global Process Error Boundaries (Google/Microsoft Enterprise Stability)
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED PROMISE REJECTION]', reason);
});

// Second Instance Handler: Restore and focus active window when user clicks shortcut again
app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('[Single Instance] Secondary launch attempted. Restoring and focusing existing instance.');
  const activeWin = presenterWindow || launcherWindow || confidenceWindow;
  if (activeWin && !activeWin.isDestroyed()) {
    if (activeWin.isMinimized()) activeWin.restore();
    activeWin.show();
    activeWin.focus();
  }
});

// Force dark mode for all native Chromium controls, popups, and dropdown menus
nativeTheme.themeSource = 'dark';

// Remove default Chromium menu bar (File/Edit/View) across all windows
Menu.setApplicationMenu(null);

// Stability flags for Chromium Network Service & GPU on Windows
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

// Global Window References
let launcherWindow = null;
let presenterWindow = null;
let audienceWindow = null;
let confidenceWindow = null;

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
  confidenceFeedEnabled: true,
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

// NDI / IP Video Streaming State (MJPEG hub for OBS Studio, vMix, TriCaster)
const streamState = {
  latestProgramBuffer: null,
  latestAlphaBuffer: null,
  programSubscribers: new Set(),
  alphaSubscribers: new Set(),
  framesReceived: 0,
  lastFrameTime: 0
};

function pushFrameToSubscribers(subscribers, buffer, mimeType = 'image/jpeg') {
  if (!buffer || subscribers.size === 0) return;
  const header = `--frame\r\nContent-Type: ${mimeType}\r\nContent-Length: ${buffer.length}\r\n\r\n`;
  for (const client of subscribers) {
    try {
      client.write(header);
      client.write(buffer);
      client.write('\r\n');
    } catch (e) {
      subscribers.delete(client);
    }
  }
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
    confidenceConnected: !!confidenceWindow && !confidenceWindow.isDestroyed(),
    confidenceFeedEnabled: state.confidenceFeedEnabled !== false,
    isPro: licenseManager.state.isPro,
    tier: licenseManager.state.tier,
    companionAuthorized: licenseManager.isCompanionApiAuthorized(),
    trialActive: licenseManager.getTrialRemainingSeconds() > 0,
    trialRemainingSeconds: licenseManager.getTrialRemainingSeconds(),
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
      // Allow localhost, local loopback, private local network IPs (RFC 1918), electron/webview, and same-host origins
      const origin = req.headers['origin'];
      const hostHeader = req.headers['host'];
      let isAllowedOrigin = !origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') || 
        origin.startsWith('vscode-webview://') ||
        origin.startsWith('file://');

      if (!isAllowedOrigin && origin) {
        try {
          const parsedOrigin = new URL(origin);
          const hostname = parsedOrigin.hostname;
          if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
            hostname.endsWith('.local') ||
            (hostHeader && parsedOrigin.host === hostHeader)
          ) {
            isAllowedOrigin = true;
          }
        } catch (e) {}
      }

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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // --- 1. STREAM CURRENT ACTIVE PDF FILE DIRECTLY (ZERO BASE64 OVERHEAD) ---
      if (pathname === '/api/document/current.pdf') {
        if (activePdfBuffer && activePdfBuffer.length > 0) {
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

  // Status and telemetry are accessible for AV discovery,
  // but control actions require Pro license or active 15-minute trial
  if (action !== 'status' && action !== 'state' && !licenseManager.isCompanionApiAuthorized()) {
    return jsonResponse({
      success: false,
      error: 'PRO_LICENSE_REQUIRED',
      message: 'Bitfocus Companion hardware control requires PDF Presenter Suite Pro or an active 15-minute trial.',
      upgradeUrl: 'https://apps.microsoft.com/detail/9NS3LKFXHBXW',
      isPro: false,
      trialActive: false
    }, 402);
  }

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

    case 'banner': {
      if (req.method === 'DELETE' || query.action === 'hide') {
        relaySyncEvent({ type: 'HIDE_BANNER', source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Audience banner hidden' });
      }

      let bannerMsg = query.message || '';
      let bannerDur = Number(query.duration || 0);

      const processBanner = (msg, dur) => {
        relaySyncEvent({
          type: 'SHOW_BANNER',
          message: msg,
          duration: dur,
          source: 'companion_api'
        });
        return jsonResponse({
          success: true,
          message: 'Audience banner displayed',
          banner: { message: msg, duration: dur }
        });
      };

      if (req.method === 'POST') {
        let bData = '';
        req.on('data', c => { bData += c; });
        req.on('end', () => {
          if (bData) {
            try {
              const parsed = JSON.parse(bData);
              if (parsed.message !== undefined) bannerMsg = parsed.message;
              if (parsed.duration !== undefined) bannerDur = Number(parsed.duration);
            } catch (e) {}
          }
          return processBanner(bannerMsg, bannerDur);
        });
        return;
      }

      return processBanner(bannerMsg, bannerDur);
    }

    case 'confidence/feed': {
      let enableFeed = null;
      if (req.method === 'DELETE' || query.action === 'disable' || query.enabled === 'false' || query.enabled === '0') {
        enableFeed = false;
      } else if (query.action === 'enable' || query.enabled === 'true' || query.enabled === '1') {
        enableFeed = true;
      } else {
        enableFeed = !state.confidenceFeedEnabled;
      }

      state.confidenceFeedEnabled = enableFeed;
      relaySyncEvent({
        type: 'SET_CONFIDENCE_FEED',
        enabled: enableFeed,
        source: 'companion_api'
      });
      broadcastState('API_CONFIDENCE_FEED');
      return jsonResponse({
        success: true,
        confidenceFeedEnabled: state.confidenceFeedEnabled,
        message: state.confidenceFeedEnabled ? 'Confidence feed enabled' : 'Confidence feed disabled',
        state: getPublicState()
      });
    }

    case 'cue':
    case 'stagecue': {
      if (req.method === 'DELETE' || query.action === 'clear') {
        relaySyncEvent({ type: 'STAGE_CUE', message: null, source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Stage cue cleared' });
      }

      let cueMsg = query.message || '';
      let cueDur = Number(query.duration || 10000);

      const processCue = (msg, dur) => {
        relaySyncEvent({
          type: 'STAGE_CUE',
          message: msg,
          duration: dur,
          source: 'companion_api'
        });
        return jsonResponse({
          success: true,
          message: 'Stage cue sent to confidence monitor',
          cue: { message: msg, duration: dur }
        });
      };

      if (req.method === 'POST') {
        let cData = '';
        req.on('data', c => { cData += c; });
        req.on('end', () => {
          if (cData) {
            try {
              const parsed = JSON.parse(cData);
              if (parsed.message !== undefined) cueMsg = parsed.message;
              if (parsed.duration !== undefined) cueDur = Number(parsed.duration);
            } catch (e) {}
          }
          return processCue(cueMsg, cueDur);
        });
        return;
      }

      return processCue(cueMsg, cueDur);
    }

    case 'message':
    case 'broadcast': {
      if (!licenseManager.isCompanionApiAuthorized()) {
        return jsonResponse({
          success: false,
          error: 'Companion API requires Pro license or active 15-minute trial.',
          code: 'PRO_REQUIRED'
        }, 402);
      }

      const processMessage = (text, targetScreen, durationVal, actionVal) => {
        const target = String(targetScreen || 'presenter').toLowerCase();
        if (req.method === 'DELETE' || actionVal === 'clear' || actionVal === 'hide') {
          if (target === 'presenter' || target === 'cockpit') {
            relaySyncEvent({ type: 'CLEAR_PRESENTER_ALERT', source: 'companion_api' });
          } else if (target === 'audience') {
            relaySyncEvent({ type: 'HIDE_BANNER', source: 'companion_api' });
          } else if (target === 'stage' || target === 'confidence') {
            relaySyncEvent({ type: 'STAGE_CUE', message: null, source: 'companion_api' });
          } else if (target === 'all') {
            relaySyncEvent({ type: 'CLEAR_PRESENTER_ALERT', source: 'companion_api' });
            relaySyncEvent({ type: 'HIDE_BANNER', source: 'companion_api' });
            relaySyncEvent({ type: 'STAGE_CUE', message: null, source: 'companion_api' });
          }
          return jsonResponse({ success: true, message: `Message cleared on ${target}`, target });
        }

        const msgText = String(text || '').trim();
        if (!msgText) {
          return jsonResponse({ success: false, error: 'Message text is required (use ?text=... or ?message=...)' }, 400);
        }

        let dur = Number(durationVal || 10);
        if (isNaN(dur) || dur < 0) dur = 10;
        const durMs = (dur > 0 && dur < 1000) ? dur * 1000 : dur;

        if (target === 'presenter' || target === 'cockpit') {
          relaySyncEvent({
            type: 'PRESENTER_ALERT',
            message: msgText,
            duration: durMs,
            target: 'presenter',
            source: 'companion_api'
          });
        } else if (target === 'audience') {
          relaySyncEvent({
            type: 'SHOW_BANNER',
            message: msgText,
            duration: durMs,
            target: 'audience',
            source: 'companion_api'
          });
        } else if (target === 'stage' || target === 'confidence') {
          relaySyncEvent({
            type: 'STAGE_CUE',
            message: msgText,
            duration: durMs,
            target: 'stage',
            source: 'companion_api'
          });
        } else if (target === 'all') {
          relaySyncEvent({
            type: 'PRESENTER_ALERT',
            message: msgText,
            duration: durMs,
            target: 'all',
            source: 'companion_api'
          });
          relaySyncEvent({
            type: 'SHOW_BANNER',
            message: msgText,
            duration: durMs,
            target: 'all',
            source: 'companion_api'
          });
          relaySyncEvent({
            type: 'STAGE_CUE',
            message: msgText,
            duration: durMs,
            target: 'all',
            source: 'companion_api'
          });
        } else {
          return jsonResponse({
            success: false,
            error: `Invalid target screen: "${target}". Valid targets are: presenter (default), audience, stage, all.`
          }, 400);
        }

        return jsonResponse({
          success: true,
          message: `Live message broadcast to ${target}`,
          target: target,
          text: msgText,
          duration: durMs
        });
      };

      let initialText = query.text || query.message || '';
      let initialTarget = query.target || query.screen || 'presenter';
      let initialDur = query.duration;
      let initialAction = query.action;

      if (req.method === 'POST') {
        let pData = '';
        req.on('data', c => { pData += c; });
        req.on('end', () => {
          if (pData) {
            try {
              const parsed = JSON.parse(pData);
              if (parsed.text !== undefined) initialText = parsed.text;
              else if (parsed.message !== undefined) initialText = parsed.message;
              if (parsed.target !== undefined) initialTarget = parsed.target;
              else if (parsed.screen !== undefined) initialTarget = parsed.screen;
              if (parsed.duration !== undefined) initialDur = parsed.duration;
              if (parsed.action !== undefined) initialAction = parsed.action;
            } catch (e) {}
          }
          return processMessage(initialText, initialTarget, initialDur, initialAction);
        });
        return;
      }

      return processMessage(initialText, initialTarget, initialDur, initialAction);
    }

    case 'info':
      return jsonResponse({
        enabled: apiSettings.enabled,
        serverRunning: isApiServerRunning,
        serverPort: apiSettings.port,
        serverHost: apiSettings.host,
        localIPs: getLocalIPs(),
        companionApiUrl: getActiveApiUrl(),
        confidenceUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/views/confidence.html` : null
      });

    // --- NDI / IP VIDEO STREAMING ---
    // POST /api/stream/frame — receives a JPEG/PNG data-URL from ndi-engine.js,
    // buffers it, and fans it out to all MJPEG subscribers (OBS, vMix, TriCaster).
    case 'stream/frame': {
      let frameData = '';
      req.on('data', c => { frameData += c; });
      req.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(frameData); } catch (e) {}
        const channel = parsed.channel || 'program';
        const dataUrl = parsed.dataUrl || '';
        if (dataUrl && typeof dataUrl === 'string') {
          const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          streamState.framesReceived++;
          streamState.lastFrameTime = Date.now();
          if (channel === 'alpha') {
            streamState.latestAlphaBuffer = buffer;
            pushFrameToSubscribers(streamState.alphaSubscribers, buffer, 'image/png');
          } else {
            streamState.latestProgramBuffer = buffer;
            pushFrameToSubscribers(streamState.programSubscribers, buffer, 'image/jpeg');
          }
          return jsonResponse({ success: true, channel, frames: streamState.framesReceived });
        }
        return jsonResponse({ success: false, error: 'No frame dataUrl provided' }, 400);
      });
      return; // Response sent async inside req.on('end')
    }

    // GET /api/stream/program.mjpg — MJPEG stream endpoint for OBS / vMix
    case 'stream/program':
    case 'stream/program.mjpg':
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'close',
        'Pragma': 'no-cache'
      });
      streamState.programSubscribers.add(res);
      if (streamState.latestProgramBuffer) {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${streamState.latestProgramBuffer.length}\r\n\r\n`);
        res.write(streamState.latestProgramBuffer);
        res.write('\r\n');
      }
      req.on('close', () => streamState.programSubscribers.delete(res));
      return; // Keep connection open — response is long-lived

    // GET /api/stream/alpha.mjpg — Alpha channel MJPEG stream for keying
    case 'stream/alpha':
    case 'stream/alpha.mjpg':
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'close',
        'Pragma': 'no-cache'
      });
      streamState.alphaSubscribers.add(res);
      if (streamState.latestAlphaBuffer) {
        res.write(`--frame\r\nContent-Type: image/png\r\nContent-Length: ${streamState.latestAlphaBuffer.length}\r\n\r\n`);
        res.write(streamState.latestAlphaBuffer);
        res.write('\r\n');
      }
      req.on('close', () => streamState.alphaSubscribers.delete(res));
      return;

    // GET /api/stream/program/snapshot — Single JPEG snapshot (for preview thumbnails)
    case 'stream/program/snapshot':
      if (streamState.latestProgramBuffer) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
        res.end(streamState.latestProgramBuffer);
      } else {
        res.writeHead(204); res.end();
      }
      return;

    // GET /api/stream/alpha/snapshot — Single PNG alpha snapshot
    case 'stream/alpha/snapshot':
      if (streamState.latestAlphaBuffer) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
        res.end(streamState.latestAlphaBuffer);
      } else {
        res.writeHead(204); res.end();
      }
      return;

    // GET /api/ndi/status — Stream health telemetry for diagnostics UI
    case 'ndi/status': {
      const port = apiSettings.port;
      const host = apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host;
      return jsonResponse({
        success: true,
        programSubscribers: streamState.programSubscribers.size,
        alphaSubscribers: streamState.alphaSubscribers.size,
        framesReceived: streamState.framesReceived,
        lastFrameTime: streamState.lastFrameTime,
        hasProgramFrame: Boolean(streamState.latestProgramBuffer),
        hasAlphaFrame: Boolean(streamState.latestAlphaBuffer),
        streamEndpoints: {
          program: `http://${host}:${port}/api/stream/program.mjpg`,
          alpha: `http://${host}:${port}/api/stream/alpha.mjpg`,
          programSnapshot: `http://${host}:${port}/api/stream/program/snapshot`,
          alphaSnapshot: `http://${host}:${port}/api/stream/alpha/snapshot`
        }
      });
    }

    default:
      return jsonResponse({ error: 'Unknown endpoint' }, 404);
  }
}

// ===========================================================================
// 2. WINDOW CREATION & LIFECYCLE MANAGEMENT
// ===========================================================================

// Secure Window Helper: Disables keyboard inspection shortcuts and devtools in production
function secureWindow(win) {
  if (!win) return;
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.control && input.shift && input.key.toLowerCase() === 'c') ||
        (input.control && input.shift && input.key.toLowerCase() === 'r') ||
        (input.control && input.key.toLowerCase() === 'r')
      ) {
        event.preventDefault();
      }
    });

    win.webContents.on('devtools-opened', () => {
      try {
        win.webContents.closeDevTools();
      } catch (e) {}
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
  } else if (config.pdfBuffer && (config.pdfBuffer.length > 0 || config.pdfBuffer.byteLength > 0)) {
    activePdfBuffer = Buffer.isBuffer(config.pdfBuffer) ? config.pdfBuffer : Buffer.from(config.pdfBuffer);
    activePdfPath = null;
  }

  currentPdfConfig = {
    isDemo: Boolean(config.isDemo),
    title: config.title || 'Presentation.pdf',
    filePath: config.filePath || null,
    totalPages: config.totalPages || 6,
    transitionDuration: typeof config.transitionDuration === 'number' ? config.transitionDuration : 1.0,
    transitionStyle: config.transitionStyle || 'crossfade',
    playlist: Array.isArray(config.playlist) ? config.playlist : []
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

function createConfidenceWindow(options = {}) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  let targetDisplay = null;
  if (options && options.displayId) {
    targetDisplay = displays.find(d => String(d.id) === String(options.displayId));
  }

  // If not explicitly found or provided, find an external display different from primary
  if (!targetDisplay) {
    if (displays.length > 2) {
      targetDisplay = displays.find(d => d.id !== primaryDisplay.id) || displays[2];
    } else if (displays.length > 1) {
      targetDisplay = displays.find(d => d.id !== primaryDisplay.id) || displays[1];
    } else {
      targetDisplay = primaryDisplay;
    }
  }

  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    if (targetDisplay) {
      confidenceWindow.setBounds({
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y,
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height
      });
      if (options && options.fullscreen) {
        confidenceWindow.setFullScreen(true);
      }
    }
    if (confidenceWindow.isMinimized()) confidenceWindow.restore();
    confidenceWindow.focus();
    return { success: true, opened: false, focused: true, displayId: targetDisplay ? targetDisplay.id : null };
  }

  const isFullscreen = options && options.fullscreen !== false;
  const bounds = targetDisplay ? targetDisplay.bounds : { x: 0, y: 0, width: 1280, height: 720 };

  confidenceWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: isFullscreen,
    minWidth: 800,
    minHeight: 600,
    title: 'PDF Presenter - Stage Confidence Monitor',
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: !app.isPackaged
    }
  });

  secureWindow(confidenceWindow);
  confidenceWindow.loadFile(path.join(__dirname, 'views/confidence.html'));
  confidenceWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Confidence Console] ${message}`);
  });

  confidenceWindow.on('closed', () => {
    confidenceWindow = null;
  });

  return { success: true, opened: true, displayId: targetDisplay ? targetDisplay.id : null };
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
  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    confidenceWindow.close();
    confidenceWindow = null;
  }

  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    launcherWindow.webContents.send('presentation-ended', {
      playlist: currentPdfConfig ? currentPdfConfig.playlist : null
    });
  } else {
    createLauncherWindow();
  }
}

function relaySyncEvent(data) {
  if (!data || typeof data !== 'object') return;

  // Zero-Trust Main Process Security Gate:
  // Disallow unauthorized broadcast of Pro features even if renderer memory was tampered with
  const isProActive = licenseManager && typeof licenseManager.isPro === 'function' && licenseManager.isPro();
  const isCompActive = licenseManager && typeof licenseManager.isCompanionApiAuthorized === 'function' && licenseManager.isCompanionApiAuthorized();

  if (data.type === 'SET_WATERMARK' && data.config && data.config.enabled && !isProActive) {
    console.warn('[Security Guard] Blocked unauthorized SET_WATERMARK sync event (Pro required)');
    return;
  }
  if (data.type === 'SHOW_BANNER' && !isProActive && !isCompActive) {
    console.warn('[Security Guard] Blocked unauthorized SHOW_BANNER sync event (Pro or Trial required)');
    return;
  }
  if (data.type === 'NDI_STREAM_START' && !isProActive) {
    console.warn('[Security Guard] Blocked unauthorized NDI broadcast sync event (Pro required)');
    return;
  }

  console.log(`[IPC Relay] ${data.type} (page: ${data.page || state.currentPage})`);
  if (data.type === 'PAGE_CHANGED' || data.type === 'GOTO_PAGE') {
    state.currentPage = Number(data.page || state.currentPage);
    diagnosticsEngine.recordLog('INFO', `Slide transition: Page ${data.page}`);
  }
  if (data.type === 'LOAD_DOCUMENT') {
    state.currentPage = 1;
    if (data.title) state.documentTitle = data.title;
    if (data.totalPages || data.slideCount) state.totalPages = Number(data.totalPages || data.slideCount);
    if (currentPdfConfig) {
      if (data.title) currentPdfConfig.title = data.title;
      if (data.path) currentPdfConfig.filePath = data.path;
      if (data.totalPages || data.slideCount) currentPdfConfig.totalPages = Number(data.totalPages || data.slideCount);
    }
    diagnosticsEngine.recordLog('INFO', `Deck switch: ${data.title || 'Document'} (${state.totalPages} slides)`);
  }
  if (data.type === 'SET_BLANK') {
    state.blankMode = data.mode;
  }
  if (data.type === 'STAGE_CUE') {
    state.activeStageCue = data.message || null;
  }
  if (data.type === 'SET_CONFIDENCE_FEED') {
    state.confidenceFeedEnabled = Boolean(data.enabled !== false);
  }

  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.webContents.send('sync-event', data);
  }

  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('sync-event', data);
  }

  if (confidenceWindow && !confidenceWindow.isDestroyed()) {
    confidenceWindow.webContents.send('sync-event', data);
  }

  // Forward sync events to all connected WebSocket clients (e.g. web confidence monitors & tablets)
  if (wsClients && wsClients.size > 0) {
    try {
      const wsPayload = JSON.stringify(data);
      const frame = encodeWsFrame(wsPayload);
      for (const client of wsClients) {
        try { if (client.writable) client.write(frame); } catch (e) { wsClients.delete(client); }
      }
    } catch (e) {}
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

ipcMain.handle('select-pdf-file', async (event, options = {}) => {
  const allowMultiple = options && options.multiple !== false;
  const result = await dialog.showOpenDialog(launcherWindow || presenterWindow, {
    properties: allowMultiple ? ['openFile', 'multiSelections'] : ['openFile'],
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

  const files = result.filePaths.map(fp => ({
    filePath: fp,
    fileName: path.basename(fp)
  }));

  return {
    canceled: false,
    filePath: filePath,
    fileName: fileName,
    filePaths: result.filePaths,
    files: files,
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
  if (buffer && (buffer.length > 0 || buffer.byteLength > 0)) {
    activePdfBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.buffer || buffer);
    activePdfPath = null;
    if (fileName && currentPdfConfig) {
      currentPdfConfig.title = fileName;
      state.documentTitle = fileName;
    }
  }
  return {
    success: true,
    streamUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/api/document/current.pdf` : null
  };
});

ipcMain.handle('sync-playlist', (event, playlist) => {
  if (Array.isArray(playlist)) {
    if (!currentPdfConfig) currentPdfConfig = {};
    currentPdfConfig.playlist = playlist;
  }
  return { success: true };
});

ipcMain.handle('start-presentation', (event, config) => {
  startPresentationWindows(config);
  if (aptabaseTrackEvent) {
    try { aptabaseTrackEvent('presentation_started'); } catch (e) {}
  }
  return { success: true };
});

ipcMain.handle('end-presentation', () => {
  endPresentation();
  if (aptabaseTrackEvent) {
    try { aptabaseTrackEvent('presentation_ended'); } catch (e) {}
  }
  return { success: true };
});

ipcMain.handle('get-presentation-data', () => {
  let bufferData = null;
  if (activePdfBuffer && activePdfBuffer.length > 0) {
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
    pdfData: (bufferData && bufferData.length > 0) ? bufferData.buffer.slice(bufferData.byteOffset, bufferData.byteOffset + bufferData.byteLength) : null,
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
    confidenceUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/views/confidence.html` : null,
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
      { path: '/api/stagecue?message=MSG', desc: 'Send silent stage cue to confidence monitor' },
      { path: '/api/message?text=MSG&target=presenter|audience|stage|all&duration=10', desc: 'Broadcast live alert message to target screen (default: presenter cockpit)' },
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
    activeUrl: getActiveApiUrl(),
    confidenceUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/views/confidence.html` : null
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
    activeUrl: getActiveApiUrl(),
    confidenceUrl: isApiServerRunning ? `http://${apiSettings.host === '0.0.0.0' ? 'localhost' : apiSettings.host}:${apiSettings.port}/views/confidence.html` : null
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

// Stage Confidence Monitor IPC Handlers (Zero-Trust Gated in Main Process)
ipcMain.handle('launch-confidence-window', (event, options = {}) => {
  if (!licenseManager || !licenseManager.isPro()) {
    if (!app.isPackaged) {
      return createConfidenceWindow(options);
    }
    console.warn('[Security Guard] Blocked unauthorized launch-confidence-window request (Pro required)');
    return { success: false, error: 'PRO_REQUIRED' };
  }
  return createConfidenceWindow(options);
});

ipcMain.handle('open-confidence-window', (event, options = {}) => {
  if (!licenseManager || !licenseManager.isPro()) {
    if (!app.isPackaged) {
      return createConfidenceWindow(options);
    }
    console.warn('[Security Guard] Blocked unauthorized open-confidence-window request (Pro required)');
    return { success: false, error: 'PRO_REQUIRED' };
  }
  return createConfidenceWindow(options);
});

ipcMain.on('open-confidence-window', (event, options = {}) => {
  if (!licenseManager || !licenseManager.isPro()) {
    if (!app.isPackaged) {
      createConfidenceWindow(options);
      return;
    }
    console.warn('[Security Guard] Blocked unauthorized open-confidence-window IPC event (Pro required)');
    return;
  }
  createConfidenceWindow(options);
});

ipcMain.on('sync-event', (event, data) => {
  relaySyncEvent(data);
});

// Freemium & In-App Purchase (IAP) IPC Handlers
ipcMain.handle('get-license-status', () => {
  return licenseManager.getPublicStatus();
});

ipcMain.handle('purchase-pro', async () => {
  return await licenseManager.launchStorePurchase();
});

ipcMain.handle('activate-license-key', (event, key) => {
  return licenseManager.activateLicenseKey(key);
});

ipcMain.handle('start-companion-trial', () => {
  return licenseManager.startCompanionTrial();
});

ipcMain.handle('set-edition', (event, edition) => {
  return licenseManager.setEdition(edition);
});

ipcMain.handle('toggle-edition', () => {
  return licenseManager.toggleEdition();
});

ipcMain.handle('forget-license', () => {
  return licenseManager.forgetStoredLicense();
});

// Broadcast license state changes to all active windows
licenseManager.onChange((status) => {
  const windows = [launcherWindow, presenterWindow, audienceWindow, confidenceWindow];
  windows.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('license-changed', status);
      win.webContents.send('license-status-changed', status);
    }
  });
  relaySyncEvent({ type: 'LICENSE_CHANGED', status });
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
  const simArg = process.argv.find(a => typeof a === 'string' && a.startsWith('--simulate-update-version='));
  const currentVersion = simArg
    ? simArg.split('=')[1]
    : (process.env.SIMULATE_UPDATE_VERSION || app.getVersion());
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

  // Extract direct platform-specific binary URL ONLY if an actual newer version is available
  let directDownloadUrl = '';
  if (hasUpdate) {
    const assets = Array.isArray(result.release.assets) ? result.release.assets : [];
    if (process.platform === 'win32') {
      const setupAsset = assets.find(a => typeof a.name === 'string' && a.name.endsWith('.exe') && a.name.includes('Setup')) ||
                         assets.find(a => typeof a.name === 'string' && a.name.endsWith('.exe'));
      if (setupAsset) directDownloadUrl = setupAsset.browser_download_url;
    } else if (process.platform === 'darwin') {
      const isArm64 = process.arch === 'arm64';
      const dmgAsset = isArm64 
        ? (assets.find(a => typeof a.name === 'string' && a.name.includes('arm64') && a.name.endsWith('.dmg')) || assets.find(a => typeof a.name === 'string' && a.name.endsWith('.dmg')))
        : (assets.find(a => typeof a.name === 'string' && !a.name.includes('arm64') && a.name.endsWith('.dmg')) || assets.find(a => typeof a.name === 'string' && a.name.endsWith('.dmg')));
      if (dmgAsset) directDownloadUrl = dmgAsset.browser_download_url;
    }
  }

  return {
    isStore: false,
    hasUpdate,
    currentVersion,
    latestVersion,
    releaseName: result.release.name || `v${latestVersion}`,
    releaseNotes: result.release.body || '',
    releaseUrl: hasUpdate ? (directDownloadUrl || result.release.html_url || 'https://github.com/SHARUNJOSEPH/pdf-presenter/releases') : '',
    directDownloadUrl
  };
});

// Helper: Download a file over HTTPS with automatic redirect resolution and progress tracking
function downloadFileWithProgress(targetUrl, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    let totalBytes = 0;
    let receivedBytes = 0;

    function executeGet(urlStr, redirectCount = 0) {
      if (redirectCount > 5) {
        fileStream.close();
        fs.unlink(destPath, () => {});
        return reject(new Error('Too many redirects while downloading update'));
      }

      const parsed = new url.URL(urlStr);
      const req = https.get(parsed, {
        headers: {
          'User-Agent': `PDF-Presenter-Suite/${app.getVersion()}`
        },
        timeout: 60000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return executeGet(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          fileStream.close();
          fs.unlink(destPath, () => {});
          return reject(new Error(`Server returned status code ${res.statusCode}`));
        }

        totalBytes = parseInt(res.headers['content-length'] || '0', 10);

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (typeof onProgress === 'function') {
            const percent = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;
            onProgress({ percent, receivedBytes, totalBytes });
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => resolve(destPath));
        });
      });

      req.on('error', (err) => {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(new Error('Download connection timed out'));
      });
    }

    executeGet(targetUrl);
  });
}

// In-App Background Update Downloader IPC Handler
ipcMain.handle('download-update', async (event, customUrl) => {
  try {
    const simArg = process.argv.find(a => typeof a === 'string' && a.startsWith('--simulate-update-version='));
    const currentVersion = simArg
      ? simArg.split('=')[1]
      : (process.env.SIMULATE_UPDATE_VERSION || app.getVersion());

    const result = await fetchLatestGithubRelease();
    if (!result.success || !result.release) {
      throw new Error('Could not fetch release information from update server');
    }

    const latestVersion = (result.release.tag_name || '').replace(/^v/, '');
    if (!isNewerVersion(latestVersion, currentVersion)) {
      return {
        success: false,
        error: `No newer update available. Installed version (v${currentVersion}) is already up to date with or newer than latest release (v${latestVersion}).`
      };
    }

    let downloadUrl = customUrl;
    if (!downloadUrl) {
      const assets = Array.isArray(result.release.assets) ? result.release.assets : [];
      if (process.platform === 'win32') {
        const setupAsset = assets.find(a => typeof a.name === 'string' && a.name.endsWith('.exe') && a.name.includes('Setup')) ||
                           assets.find(a => typeof a.name === 'string' && a.name.endsWith('.exe'));
        if (setupAsset) downloadUrl = setupAsset.browser_download_url;
      } else if (process.platform === 'darwin') {
        const isArm64 = process.arch === 'arm64';
        const dmgAsset = isArm64 
          ? (assets.find(a => typeof a.name === 'string' && a.name.includes('arm64') && a.name.endsWith('.dmg')) || assets.find(a => typeof a.name === 'string' && a.name.endsWith('.dmg')))
          : (assets.find(a => typeof a.name === 'string' && !a.name.includes('arm64') && a.name.endsWith('.dmg')) || assets.find(a => typeof a.name === 'string' && a.name.endsWith('.dmg')));
        if (dmgAsset) downloadUrl = dmgAsset.browser_download_url;
      }
    }

    if (!downloadUrl) {
      throw new Error('No compatible installer found for this platform in the latest release');
    }

    const ext = process.platform === 'darwin' ? '.dmg' : '.exe';
    const tempDir = app.getPath('temp');
    const fileName = `PDF-Presenter-Suite-Update-${Date.now()}${ext}`;
    const targetFilePath = path.join(tempDir, fileName);

    await downloadFileWithProgress(downloadUrl, targetFilePath, (progress) => {
      event.sender.send('update-download-progress', progress);
    });

    event.sender.send('update-downloaded', { filePath: targetFilePath });
    return { success: true, filePath: targetFilePath };
  } catch (err) {
    console.error('[AutoUpdate] Download error:', err);
    return { success: false, error: err.message };
  }
});

// In-App Update Installer & Reloader IPC Handler
ipcMain.handle('install-update', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, error: 'Downloaded installer file not found on disk' };
    }

    if (process.platform === 'win32') {
      const child = child_process.spawn(filePath, [], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      setTimeout(() => {
        app.quit();
      }, 600);
      return { success: true };
    } else {
      await shell.openPath(filePath);
      return { success: true };
    }
  } catch (err) {
    console.error('[AutoUpdate] Install error:', err);
    return { success: false, error: err.message };
  }
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

// Native Desktop Shortcut Creator for Windows (Microsoft Store, Dev & Standalone)
function createDesktopShortcut() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Desktop shortcuts are only supported on Windows.' };
  }

  try {
    const isStore = Boolean(process.windowsStore);
    const isPackaged = app.isPackaged;
    const appDir = app.getAppPath();
    const diskIcon = path.join(appDir, 'build', 'icon.ico');

    // Cache icon in userData for reliable shell access (especially for Store / packaged environments)
    let resolvedIconPath = '';
    try {
      const userDataIcon = path.join(app.getPath('userData'), 'app-icon.ico');
      if (fs.existsSync(diskIcon)) {
        if (!fs.existsSync(userDataIcon) || fs.statSync(diskIcon).size !== fs.statSync(userDataIcon).size) {
          fs.copyFileSync(diskIcon, userDataIcon);
        }
        resolvedIconPath = userDataIcon;
      } else if (fs.existsSync(userDataIcon)) {
        resolvedIconPath = userDataIcon;
      }
    } catch (e) {
      console.warn('[Desktop Shortcut] Icon cache notice:', e.message);
    }

    let target = '';
    let args = '';
    let workingDir = '';
    let iconLocation = '';

    if (isStore) {
      // Microsoft Store UWP/AppX Package
      target = 'explorer.exe';
      args = 'shell:AppsFolder\\JOSEPHSHARUN.PDFPresenterSuite_1zxrw60jqtf3j!PDFPresenterSuite';
      workingDir = path.dirname(process.execPath);
      iconLocation = resolvedIconPath || (fs.existsSync(diskIcon) ? diskIcon : `${process.execPath},0`);
    } else if (isPackaged) {
      // Packaged Standalone / NSIS / Portable Executable
      target = process.execPath;
      args = '';
      workingDir = path.dirname(process.execPath);
      iconLocation = resolvedIconPath || `${process.execPath},0`;
    } else {
      // Development mode (running via electron / VS Code / npm start)
      target = process.execPath;
      args = `"${appDir}"`;
      workingDir = appDir;
      iconLocation = resolvedIconPath || (fs.existsSync(diskIcon) ? diskIcon : '');
    }

    const psQuote = (val) => {
      if (!val) return "''";
      return `'${String(val).replace(/'/g, "''")}'`;
    };

    const psScript = [
      `$WshShell = New-Object -ComObject WScript.Shell`,
      `$Desktop = $WshShell.SpecialFolders('Desktop')`,
      `$ShortcutPath = Join-Path $Desktop 'PDF Presenter Suite.lnk'`,
      `$Shortcut = $WshShell.CreateShortcut($ShortcutPath)`,
      `$Shortcut.TargetPath = ${psQuote(target)}`,
      `$Shortcut.Arguments = ${psQuote(args)}`,
      `$Shortcut.Description = 'PDF Presenter Suite - Professional Presentation Software'`,
      iconLocation ? `$Shortcut.IconLocation = ${psQuote(iconLocation)}` : '',
      workingDir ? `$Shortcut.WorkingDirectory = ${psQuote(workingDir)}` : '',
      `$Shortcut.Save()`,
      `Write-Output $ShortcutPath`
    ].filter(Boolean).join('\n');

    const createdPath = child_process.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], {
      input: psScript,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    }).trim();

    console.log('[Desktop Shortcut] Successfully created/updated shortcut at:', createdPath);
    return { success: true, path: createdPath };
  } catch (err) {
    console.warn('[Desktop Shortcut] Failed to create shortcut:', err.message);
    return { success: false, error: err.message };
  }
}

// Automatically ensure desktop shortcut exists on first run.
// Only runs for:
//   - Microsoft Store (AppX) installs — the Store does NOT create a desktop shortcut.
//   - Dev / git installs (unpackaged) — no installer, so no shortcut was made.
// SKIPPED for NSIS / portable packaged exe: electron-builder's createDesktopShortcut:true
// already writes the .lnk during installation, so creating another one here would produce
// two identical shortcuts on the user's desktop.
function ensureDesktopShortcutOnFirstRun() {
  if (process.platform !== 'win32') return;

  const isStore = Boolean(process.windowsStore);
  const isPackaged = app.isPackaged;

  // NSIS/portable packaged exe already has a shortcut from the installer — skip.
  if (isPackaged && !isStore) return;

  try {
    const cfg = loadApiSettings();
    if (!cfg.desktopShortcutCreated) {
      const res = createDesktopShortcut();
      if (res.success) {
        cfg.desktopShortcutCreated = true;
        saveApiSettings();
      }
    }
  } catch (e) {
    console.warn('[Desktop Shortcut] First-run shortcut check skipped:', e.message);
  }
}

ipcMain.handle('create-desktop-shortcut', () => {
  return createDesktopShortcut();
});

// Diagnostics & Bug Report Generator IPC Handlers
ipcMain.handle('generate-bug-report', async () => {
  diagnosticsEngine.recordLog('INFO', 'Generating diagnostic bug report');

  let gpuFeatures = {};
  let gpuInfo = {};
  try {
    gpuFeatures = app.getGPUFeatureStatus();
  } catch (e) {
    gpuFeatures = { error: e.message };
  }
  try {
    gpuInfo = await app.getGPUInfo('basic');
  } catch (e) {
    gpuInfo = { error: e.message };
  }

  let displays = [];
  try {
    displays = screen.getAllDisplays().map((d) => {
      const primary = screen.getPrimaryDisplay();
      return {
        id: d.id,
        label: d.label || (d.id === primary.id ? 'Built-in Screen' : 'External Display'),
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
        displayFrequency: d.displayFrequency || 60,
        isPrimary: d.id === primary.id
      };
    });
  } catch (e) {
    displays = [];
  }

  const activeSwitches = {
    gpuRasterization: 'enable-gpu-rasterization',
    zeroCopy: 'enable-zero-copy',
    disableOcclusion: 'CalculateNativeWinOcclusion'
  };

  const presentation = {
    hasDeck: Boolean(activePdfBuffer || activePdfPath || (currentPdfConfig && !currentPdfConfig.isDemo)),
    slideCount: (currentPdfConfig && currentPdfConfig.totalPages) || (state && state.totalPages) || 0,
    currentSlide: (state && state.currentPage) || 1,
    transition: 'dissolve 1.0s',
    isAudienceActive: Boolean(audienceWindow && !audienceWindow.isDestroyed())
  };

  const diagData = diagnosticsEngine.buildDiagnosticData({
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    isStore: Boolean(process.windowsStore),
    displays,
    gpuFeatures,
    gpuInfo,
    activeSwitches,
    presentation
  });

  const markdown = diagnosticsEngine.formatMarkdownReport(diagData);

  if (aptabaseTrackEvent) {
    try {
      aptabaseTrackEvent('bug_report_generated', {
        flickerRisk: diagData.flickerAnalysis.flickerRisk,
        displaysCount: displays.length
      });
    } catch (e) {}
  }

  return {
    success: true,
    data: diagData,
    markdown
  };
});

ipcMain.handle('save-bug-report', async (event, markdownContent) => {
  try {
    const defaultFilename = `pdf-presenter-bug-report-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;
    const targetWin = BrowserWindow.fromWebContents(event.sender) || launcherWindow;
    let defaultDir = '';
    try {
      defaultDir = app.getPath('downloads');
    } catch (e) {
      defaultDir = os.homedir();
    }

    const { canceled, filePath } = await dialog.showSaveDialog(targetWin, {
      title: 'Save Diagnostics Bug Report',
      defaultPath: path.join(defaultDir, defaultFilename),
      filters: [
        { name: 'Markdown Report', extensions: ['md'] },
        { name: 'Text Document', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, markdownContent, 'utf8');
    diagnosticsEngine.recordLog('INFO', `Bug report saved to file: ${diagnosticsEngine.sanitizePath(filePath)}`);
    return { success: true, filePath };
  } catch (err) {
    console.error('[Save Bug Report Error]', err);
    return { success: false, error: err.message };
  }
});

ipcMain.on('record-diagnostic-log', (event, { level, message, meta } = {}) => {
  diagnosticsEngine.recordLog(level || 'INFO', message, meta);
});

// App Lifecycle
app.whenReady().then(async () => {
  if (aptabaseTrackEvent) {
    try {
      aptabaseTrackEvent('app_started', {
        version: app.getVersion()
      });
    } catch (e) {}
  }
  loadApiSettings();
  ensureDesktopShortcutOnFirstRun();
  if (apiSettings.enabled) {
    await startCompanionServer(apiSettings.host, apiSettings.port);
  }
  createLauncherWindow();

  // Broadcast License & Entitlement changes to all active windows
  licenseManager.onChange((licenseStatus) => {
    const wins = [launcherWindow, presenterWindow, audienceWindow];
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('license-changed', licenseStatus);
      }
    }
    broadcastState('LICENSE_UPDATE');
  });

  // Real-time Display Topology & Hotplug Broadcaster (HDMI / DisplayPort)
  function broadcastDisplayChange(changeType, detail = {}) {
    const displays = screen.getAllDisplays().map((d, index) => {
      const primary = screen.getPrimaryDisplay();
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

    const payload = { changeType, displays, detail, count: displays.length };
    const wins = [launcherWindow, presenterWindow, audienceWindow, confidenceWindow];
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('displays-changed', payload);
      }
    }
  }

  // Multi-Screen & Display Hotplug Resilience (Google/Microsoft Enterprise Standard)
  screen.on('display-added', (event, newDisplay) => {
    console.log(`[Display Hotplug Alert] External display ${newDisplay.id} connected via HDMI/DisplayPort (${newDisplay.bounds.width}x${newDisplay.bounds.height}).`);
    broadcastDisplayChange('display-added', { displayId: newDisplay.id, bounds: newDisplay.bounds });
  });

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
    broadcastDisplayChange('display-removed', { displayId: oldDisplay.id });
  });

  screen.on('display-metrics-changed', (event, display, changedMetrics) => {
    console.log(`[Display Metrics Changed] Display ${display.id}: ${changedMetrics ? changedMetrics.join(', ') : 'unknown'}`);
    broadcastDisplayChange('display-metrics-changed', { displayId: display.id, changedMetrics });
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
