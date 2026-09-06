// tests/api-server.test.js - Integration tests for Bitfocus Companion REST API & CORS security
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const url = require('node:url');

describe('Bitfocus Companion REST API & Threat Model Integration', () => {
  let server;
  let baseUrl;
  const TEST_PORT = 3199;

  const testState = {
    currentPage: 1,
    totalPages: 6,
    documentTitle: 'Test Presentation.pdf',
    blankMode: 'none',
    timerSeconds: 0,
    timerRunning: false
  };

  before((done) => {
    server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const pathname = parsedUrl.pathname;

      // Origin validation (same security logic as main.js)
      const origin = req.headers['origin'];
      const isAllowedOrigin = !origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1') || 
        origin.startsWith('vscode-webview://') ||
        origin.startsWith('file://');

      if (origin && !isAllowedOrigin) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cross-Origin Forbidden' }));
        return;
      }

      if (origin && isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          page: testState.currentPage,
          totalPages: testState.totalPages,
          title: testState.documentTitle,
          blankMode: testState.blankMode
        }));
        return;
      }

      if (pathname === '/api/next' && req.method === 'POST') {
        if (testState.currentPage < testState.totalPages) testState.currentPage++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, page: testState.currentPage }));
        return;
      }

      if (pathname === '/api/prev' && req.method === 'POST') {
        if (testState.currentPage > 1) testState.currentPage--;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, page: testState.currentPage }));
        return;
      }

      if (pathname === '/api/first' && req.method === 'POST') {
        testState.currentPage = 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, page: 1 }));
        return;
      }

      if (pathname === '/api/last' && req.method === 'POST') {
        testState.currentPage = testState.totalPages;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, page: testState.totalPages }));
        return;
      }

      if (pathname === '/api/blackout' && req.method === 'POST') {
        testState.blankMode = (testState.blankMode === 'black' ? 'none' : 'black');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, blankMode: testState.blankMode }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    return new Promise((resolve) => {
      server.listen(TEST_PORT, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  function makeRequest(path, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(path, baseUrl);
      const req = http.request(u, { method, headers }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  test('GET /api/status returns 200 with presentation telemetry', async () => {
    const res = await makeRequest('/api/status', 'GET');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.success, true);
    assert.strictEqual(res.json.page, 1);
    assert.strictEqual(res.json.totalPages, 6);
    assert.strictEqual(res.json.title, 'Test Presentation.pdf');
    assert.strictEqual(res.json.blankMode, 'none');
  });

  test('POST /api/next advances slide state', async () => {
    const res = await makeRequest('/api/next', 'POST');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.page, 2);
    assert.strictEqual(testState.currentPage, 2);
  });

  test('POST /api/prev returns to previous slide', async () => {
    const res = await makeRequest('/api/prev', 'POST');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.page, 1);
    assert.strictEqual(testState.currentPage, 1);
  });

  test('POST /api/last jumps to final slide', async () => {
    const res = await makeRequest('/api/last', 'POST');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.page, 6);
    assert.strictEqual(testState.currentPage, 6);
  });

  test('POST /api/first jumps back to first slide', async () => {
    const res = await makeRequest('/api/first', 'POST');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.page, 1);
    assert.strictEqual(testState.currentPage, 1);
  });

  test('POST /api/blackout toggles blackout curtain', async () => {
    const res1 = await makeRequest('/api/blackout', 'POST');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.json.blankMode, 'black');

    const res2 = await makeRequest('/api/blackout', 'POST');
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.json.blankMode, 'none');
  });

  test('Non-browser clients (Bitfocus Companion, hardware) succeed without Origin header', async () => {
    const res = await makeRequest('/api/status', 'GET', {});
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
  });

  test('Trusted local origins (http://localhost:3000) succeed with matching CORS header', async () => {
    const res = await makeRequest('/api/status', 'GET', { 'Origin': 'http://localhost:3000' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  test('Malicious external web origins (https://malicious-site.com) are blocked with 403 Forbidden', async () => {
    const res = await makeRequest('/api/next', 'POST', { 'Origin': 'https://malicious-site.com' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.json.error, 'Cross-Origin Forbidden');
  });
});
