const test = require('node:test');
const assert = require('node:assert/strict');
const locales = require('../js/locales');
const i18n = require('../js/i18n');

test('i18n - All 11 Core Languages Loaded', () => {
  const supported = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ar', 'pt', 'hi', 'ru', 'it'];
  for (const lang of supported) {
    assert(locales[lang], `Language ${lang} must be present in locales`);
  }
});

test('i18n - 100% Translation Key Parity Across All 11 Languages', () => {
  const baseKeys = extractKeys(locales.en);
  const supported = ['es', 'fr', 'de', 'zh', 'ja', 'ar', 'pt', 'hi', 'ru', 'it'];

  for (const lang of supported) {
    const currentKeys = extractKeys(locales[lang]);
    for (const key of baseKeys) {
      assert(currentKeys.includes(key), `Language '${lang}' is missing key: ${key}`);
      const val = getNestedValue(locales[lang], key);
      assert(typeof val === 'string' && val.trim().length > 0, `Value for '${key}' in '${lang}' must not be empty`);
    }
  }
});

test('i18n - Parameterized String Interpolation Across ALL 11 Languages', () => {
  const supported = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ar', 'pt', 'hi', 'ru', 'it'];
  for (const lang of supported) {
    i18n.setLanguage(lang);
    const counter = i18n.t('presenter.slideCounter', { current: 3, total: 10 });
    assert(counter.includes('3'), `Language '${lang}' counter must include current page '3': "${counter}"`);
    assert(counter.includes('10'), `Language '${lang}' counter must include total pages '10': "${counter}"`);
    assert(!counter.includes('{current}') && !counter.includes('{total}'), `Language '${lang}' counter must have no unresolved tokens: "${counter}"`);
  }
});

test('i18n - Directionality Isolation (Only Arabic is RTL, All 10 others are LTR)', () => {
  const langs = i18n.getSupportedLanguages();
  for (const [code, meta] of Object.entries(langs)) {
    if (code === 'ar') {
      assert.equal(meta.dir, 'rtl', 'Arabic must be RTL');
    } else {
      assert.equal(meta.dir, 'ltr', `${code} must be LTR`);
    }
  }
});

test('i18n - Graceful Fallback for Non-Existent Key', () => {
  i18n.setLanguage('es');
  const missing = i18n.t('non.existent.dummy.key');
  assert.equal(missing, 'non.existent.dummy.key', 'Missing key should return keypath string');
});

test('i18n - Partial Parameter Interpolation Resilience', () => {
  i18n.setLanguage('en');
  const partial = i18n.t('presenter.slideCounter', { current: 4 });
  assert.equal(partial, 'Slide 4 of {total}', 'Unspecified parameters must remain as placeholders without throwing');
});

test('i18n - Invalid Language Code Rejection & State Preservation', () => {
  i18n.setLanguage('de');
  assert.equal(i18n.getCurrentLanguage(), 'de');
  i18n.setLanguage('non_existent_locale_xyz');
  assert.equal(i18n.getCurrentLanguage(), 'de', 'Invalid language must be rejected and preserve current language');
});

test('i18n - Missing Key Fallback to English', () => {
  i18n.setLanguage('es');
  const fallback = i18n.t('common.appName');
  assert.equal(fallback, 'PDF Presenter Suite');
});

function extractKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(extractKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  for (const k of keys) {
    if (!current) return undefined;
    current = current[k];
  }
  return current;
}