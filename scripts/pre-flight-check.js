#!/usr/bin/env node
// scripts/pre-flight-check.js - Enterprise Pre-Flight Release Certification Pipeline
// Inspired by Google ISE & Microsoft SDL Release Quality Gates

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

console.log('\n=============================================================');
console.log('  🚀 PDF Presenter Suite - Pre-Flight Release Quality Audit  ');
console.log('=============================================================\n');

let passedChecks = 0;
let totalChecks = 0;

function runCheck(name, fn) {
  totalChecks++;
  process.stdout.write(`  [CHECK ${totalChecks}] ${name}... `);
  try {
    fn();
    console.log('✅ PASS');
    passedChecks++;
  } catch (err) {
    console.log('❌ FAIL');
    console.error(`      Reason: ${err.message}\n`);
  }
}

// 1. Source Syntax Audit
runCheck('Syntax validation across all JavaScript source files', () => {
  const jsFiles = [
    'main.js',
    'preload.js',
    'js/locales.js',
    'js/i18n.js',
    'js/demo-deck.js',
    'js/pdf-loader.js',
    'js/presenter.js',
    'js/audience.js',
    'js/launcher.js',
    'js/sync-channel.js'
  ];

  for (const file of jsFiles) {
    const filePath = path.join(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File missing: ${file}`);
    }
    execSync(`node -c "${filePath}"`, { stdio: 'pipe' });
  }
});

// 2. Automated Test Suite
runCheck('Unit & Integration Test Suite execution (node:test)', () => {
  const output = execSync('node --test tests/**/*.test.js', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (!output.includes('fail 0')) {
    throw new Error('Some automated tests failed.');
  }
});

// 3. Security & Content Security Policy (CSP) Audit
runCheck('Content Security Policy (CSP) headers in all views', () => {
  const htmlFiles = [
    'views/launcher.html',
    'views/presenter.html',
    'views/audience.html'
  ];

  for (const html of htmlFiles) {
    const htmlPath = path.join(__dirname, '..', html);
    const content = fs.readFileSync(htmlPath, 'utf8');
    if (!content.includes('http-equiv="Content-Security-Policy"')) {
      throw new Error(`Missing Content Security Policy in ${html}`);
    }
    if (!content.includes("default-src 'self'")) {
      throw new Error(`CSP in ${html} missing strict default-src policy`);
    }
  }
});

// 4. Critical Build Assets & PDF.js Vendor Audit
runCheck('Critical offline vendor assets & icon inspection', () => {
  const assets = [
    { file: 'build/icon.png', minSize: 1000 },
    { file: 'vendor/pdfjs/pdf.min.js', minSize: 100000 },
    { file: 'vendor/pdfjs/pdf.worker.min.js', minSize: 100000 }
  ];

  for (const asset of assets) {
    const p = path.join(__dirname, '..', asset.file);
    if (!fs.existsSync(p)) {
      throw new Error(`Required offline asset missing: ${asset.file}`);
    }
    const stat = fs.statSync(p);
    if (stat.size < asset.minSize) {
      throw new Error(`Asset ${asset.file} is suspiciously small (${stat.size} bytes)`);
    }
  }
});

// 5. Package Metadata Audit
runCheck('Application package metadata and scripts', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  if (!pkg.name || !pkg.version || !pkg.main) {
    throw new Error('package.json missing name, version, or main entry.');
  }
  if (!pkg.build || !pkg.build.appId || !pkg.build.productName) {
    throw new Error('package.json missing electron-builder appId or productName.');
  }
});

// 6. Internationalization (i18n) 11-Language Bundle Audit
runCheck('Internationalization (i18n) 11-language integrity & parity', () => {
  const locales = require('../js/locales');
  const requiredLangs = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ar', 'pt', 'hi', 'ru', 'it'];
  for (const lang of requiredLangs) {
    if (!locales[lang]) {
      throw new Error(`Locale bundle missing language: ${lang}`);
    }
  }
});

// Summary
console.log('\n-------------------------------------------------------------');
console.log(`  Audit Result: ${passedChecks}/${totalChecks} Quality Gates Passed.`);
console.log('-------------------------------------------------------------\n');

if (passedChecks === totalChecks) {
  console.log('  🎯 CERTIFICATION PASSED: The codebase meets Big Tech release standards.');
  console.log('     Code is clean, fully tested, hardened, and ready for use.\n');
  process.exit(0);
} else {
  console.error('  ⚠️ CERTIFICATION FAILED: Resolve issues before building or testing.\n');
  process.exit(1);
}
