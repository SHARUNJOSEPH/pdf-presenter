// server.js - Embedded Node.js HTTP Server, WebSocket Hub & Bitfocus Companion REST API
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Global Presentation State
const state = {
  currentPage: 1,
  totalPages: 6,
  documentTitle: 'Interactive Demo Deck',
  blankMode: 'none',
  timerSeconds: 0,
  timerRunning: false,
  laserActive: false,
  audienceConnected: false,
  presenterConnected: false,
  lastUpdated: Date.now()
};

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

const wsClients = new Set();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

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
    audienceConnected: state.audienceConnected,
    presenterConnected: state.presenterConnected,
    lastUpdated: state.lastUpdated
  };
}

function broadcastWs(messageObj) {
  const payload = typeof messageObj === 'string' ? messageObj : JSON.stringify(messageObj);
  const frame = encodeWsFrame(payload);
  for (const client of wsClients) {
    try { if (client.writable) client.write(frame); } catch (e) { wsClients.delete(client); }
  }
}

function broadcastState(actionSource = 'STATE_UPDATE') {
  state.lastUpdated = Date.now();
  broadcastWs({
    type: 'STATE_SYNC',
    source: actionSource,
    state: getPublicState()
  });
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

function setupWsClient(socket) {
  wsClients.add(socket);
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const opcode = firstByte & 0x0f;
      const isMasked = (buffer[1] & 0x80) === 0x80;
      let payloadLength = buffer[1] & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) return;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) return;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) return;

      const rawPayload = buffer.slice(offset, offset + payloadLength);
      buffer = buffer.slice(offset + payloadLength);

      let payload = rawPayload;
      if (isMasked && maskKey) {
        payload = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
          payload[i] = rawPayload[i] ^ maskKey[i % 4];
        }
      }

      if (opcode === 0x8) {
        socket.end();
        wsClients.delete(socket);
        return;
      } else if (opcode === 0x9) {
        socket.write(Buffer.from([0x8a, 0x00]));
      } else if (opcode === 0x1) {
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          handleIncomingWsMessage(msg, socket);
        } catch (err) {}
      }
    }
  });

  socket.on('close', () => wsClients.delete(socket));
  socket.on('error', () => wsClients.delete(socket));

  const initialFrame = encodeWsFrame(JSON.stringify({
    type: 'INIT_STATE',
    state: getPublicState()
  }));
  socket.write(initialFrame);
}

function handleIncomingWsMessage(msg, senderSocket) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'CLIENT_HELLO':
      if (msg.role === 'presenter') state.presenterConnected = true;
      if (msg.role === 'audience') state.audienceConnected = true;
      broadcastState('CLIENT_JOINED');
      break;

    case 'UPDATE_STATE':
      if (msg.currentPage !== undefined) state.currentPage = Number(msg.currentPage);
      if (msg.totalPages !== undefined) state.totalPages = Number(msg.totalPages);
      if (msg.documentTitle !== undefined) state.documentTitle = String(msg.documentTitle);
      if (msg.blankMode !== undefined) state.blankMode = msg.blankMode;
      if (msg.timerRunning !== undefined) {
        if (msg.timerRunning) startServerTimer();
        else pauseServerTimer();
      }
      if (msg.timerSeconds !== undefined) state.timerSeconds = Number(msg.timerSeconds);
      if (msg.laserActive !== undefined) state.laserActive = Boolean(msg.laserActive);
      broadcastState('PRESENTER_UPDATE');
      break;

    case 'FORWARD_SYNC':
      broadcastWs(msg);
      break;

    case 'PING':
      senderSocket.write(encodeWsFrame(JSON.stringify({ type: 'PONG', time: Date.now() })));
      break;
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- REST API ENDPOINTS (BITFOCUS COMPANION) ---
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname, parsedUrl.query);
    return;
  }

  // Route clean names to view files
  if (pathname === '/' || pathname === '/index.html' || pathname === '/launcher') {
    pathname = '/views/launcher.html';
  } else if (pathname === '/presenter' || pathname === '/presenter.html') {
    pathname = '/views/presenter.html';
  } else if (pathname === '/audience' || pathname === '/audience.html') {
    pathname = '/views/audience.html';
  }

  let filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1><p><a href="/">Return to Setup Launcher</a></p>');
      return;
    }
    serveFile(res, filePath);
  });
});

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function handleApiRequest(req, res, pathname, query) {
  const jsonResponse = (data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  };

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsedBody = {};
    if (body) {
      try { parsedBody = JSON.parse(body); } catch (e) {}
    }

    const action = pathname.replace('/api/', '').toLowerCase();

    switch (action) {
      case 'status':
      case 'state':
        return jsonResponse(getPublicState());

      case 'next':
        if (state.currentPage < state.totalPages) {
          state.currentPage++;
          broadcastState('API_NEXT');
          broadcastWs({ type: 'GOTO_PAGE', page: state.currentPage, source: 'companion_api' });
        }
        return jsonResponse({ success: true, message: 'Advanced to next slide', state: getPublicState() });

      case 'prev':
      case 'previous':
        if (state.currentPage > 1) {
          state.currentPage--;
          broadcastState('API_PREV');
          broadcastWs({ type: 'GOTO_PAGE', page: state.currentPage, source: 'companion_api' });
        }
        return jsonResponse({ success: true, message: 'Returned to previous slide', state: getPublicState() });

      case 'first':
        state.currentPage = 1;
        broadcastState('API_FIRST');
        broadcastWs({ type: 'GOTO_PAGE', page: 1, source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Jumped to first slide', state: getPublicState() });

      case 'last':
        state.currentPage = state.totalPages;
        broadcastState('API_LAST');
        broadcastWs({ type: 'GOTO_PAGE', page: state.totalPages, source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Jumped to last slide', state: getPublicState() });

      case 'goto':
        const targetPage = Number(query.page || parsedBody.page || 1);
        if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= state.totalPages) {
          state.currentPage = targetPage;
          broadcastState('API_GOTO');
          broadcastWs({ type: 'GOTO_PAGE', page: targetPage, source: 'companion_api' });
          return jsonResponse({ success: true, message: `Jumped to slide ${targetPage}`, state: getPublicState() });
        }
        return jsonResponse({ success: false, error: `Invalid page ${targetPage}` }, 400);

      case 'blackout':
        state.blankMode = (state.blankMode === 'black') ? 'none' : 'black';
        broadcastState('API_BLACKOUT');
        broadcastWs({ type: 'SET_BLANK', mode: state.blankMode, source: 'companion_api' });
        return jsonResponse({ success: true, blankMode: state.blankMode, state: getPublicState() });

      case 'whiteout':
        state.blankMode = (state.blankMode === 'white') ? 'none' : 'white';
        broadcastState('API_WHITEOUT');
        broadcastWs({ type: 'SET_BLANK', mode: state.blankMode, source: 'companion_api' });
        return jsonResponse({ success: true, blankMode: state.blankMode, state: getPublicState() });

      case 'timer/start':
        startServerTimer();
        broadcastWs({ type: 'TIMER_CONTROL', action: 'start', source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Timer started', state: getPublicState() });

      case 'timer/pause':
      case 'timer/stop':
        pauseServerTimer();
        broadcastWs({ type: 'TIMER_CONTROL', action: 'pause', source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Timer paused', state: getPublicState() });

      case 'timer/reset':
        resetServerTimer();
        broadcastWs({ type: 'TIMER_CONTROL', action: 'reset', source: 'companion_api' });
        return jsonResponse({ success: true, message: 'Timer reset', state: getPublicState() });

      case 'info':
        const ips = getLocalIPs();
        return jsonResponse({
          serverPort: PORT,
          localIPs: ips,
          launcherUrl: `http://localhost:${PORT}/`,
          presenterUrl: `http://localhost:${PORT}/presenter.html`,
          audienceUrl: `http://localhost:${PORT}/audience.html`,
          websocketUrl: `ws://localhost:${PORT}/ws`,
          endpoints: [
            { method: 'GET/POST', path: '/api/next', desc: 'Advance slide' },
            { method: 'GET/POST', path: '/api/prev', desc: 'Previous slide' },
            { method: 'GET/POST', path: '/api/first', desc: 'First slide' },
            { method: 'GET/POST', path: '/api/last', desc: 'Last slide' },
            { method: 'GET/POST', path: '/api/goto?page=N', desc: 'Go to slide N' },
            { method: 'GET/POST', path: '/api/blackout', desc: 'Toggle blackout' },
            { method: 'GET/POST', path: '/api/whiteout', desc: 'Toggle whiteout' },
            { method: 'GET/POST', path: '/api/timer/start', desc: 'Start timer' },
            { method: 'GET/POST', path: '/api/timer/pause', desc: 'Pause timer' },
            { method: 'GET/POST', path: '/api/timer/reset', desc: 'Reset timer' },
            { method: 'GET/POST', path: '/api/status', desc: 'Live status JSON' }
          ]
        });

      default:
        return jsonResponse({ error: 'Unknown API endpoint' }, 404);
    }
  });
}

server.on('upgrade', (req, socket) => {
  const pathname = url.parse(req.url).pathname;
  if (pathname === '/ws' || pathname === '/') {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const acceptValue = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptValue}`].join('\r\n') + '\r\n\r\n');
    setupWsClient(socket);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log(`\n[PDF Presenter Server] Running on port ${PORT}`);
});
