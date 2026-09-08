/**
 * PDF Presenter Suite - Enterprise Internationalization (i18n) Engine
 */
(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./locales'], factory);
  } else if (typeof module === 'object' && module.exports) {
    const locales = (typeof root !== 'undefined' && root.I18N_LOCALES) ? root.I18N_LOCALES : require('./locales');
    const engine = factory(locales);
    module.exports = engine;
    if (typeof root !== 'undefined') root.i18n = engine;
  } else {
    root.i18n = factory(root.I18N_LOCALES);
  }
}(typeof self !== 'undefined' ? self : this, function(I18N_LOCALES) {
  'use strict';

  const SUPPORTED_LANGUAGES = {
    'en': { name: 'English', nativeName: 'English', dir: 'ltr' },
    'es': { name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
    'fr': { name: 'French', nativeName: 'Français', dir: 'ltr' },
    'de': { name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
    'zh': { name: 'Chinese (Simplified)', nativeName: '简体中文', dir: 'ltr' },
    'ja': { name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
    'ar': { name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
    'pt': { name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
    'hi': { name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
    'ru': { name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
    'it': { name: 'Italian', nativeName: 'Italiano', dir: 'ltr' }
  };

  const translations = I18N_LOCALES || {};

  class I18nEngine {
    constructor() {
      this.currentLang = 'en';
      this.selectedPreference = 'auto';
      this.init();
    }

    init() {
      try {
        if (typeof localStorage !== 'undefined') {
          const saved = localStorage.getItem('pdf_presenter_language');
          if (saved && (saved === 'auto' || SUPPORTED_LANGUAGES[saved])) {
            this.selectedPreference = saved;
          }
        }
      } catch (e) {}

      this.resolveLanguage();
    }

    resolveLanguage() {
      if (this.selectedPreference !== 'auto' && SUPPORTED_LANGUAGES[this.selectedPreference]) {
        this.currentLang = this.selectedPreference;
        return this.currentLang;
      }

      let detected = 'en';
      if (typeof navigator !== 'undefined') {
        const languages = navigator.languages || [navigator.language || navigator.userLanguage];
        for (const raw of languages) {
          if (!raw) continue;
          const code = raw.toLowerCase().split(/[-_]/)[0];
          if (SUPPORTED_LANGUAGES[code]) {
            detected = code;
            break;
          }
        }
      }

      this.currentLang = detected;
      return this.currentLang;
    }

    getSupportedLanguages() {
      return SUPPORTED_LANGUAGES;
    }

    getCurrentLanguage() {
      return this.currentLang;
    }

    getSelectedPreference() {
      return this.selectedPreference;
    }

    setLanguage(langCode) {
      if (langCode === 'auto') {
        this.selectedPreference = 'auto';
      } else if (SUPPORTED_LANGUAGES[langCode]) {
        this.selectedPreference = langCode;
      } else {
        return;
      }

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('pdf_presenter_language', this.selectedPreference);
        }
      } catch (e) {}

      this.resolveLanguage();
      this.updateDocumentDirection();
      this.applyTranslations();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('languageChanged', {
          detail: {
            language: this.currentLang,
            isRTL: SUPPORTED_LANGUAGES[this.currentLang].dir === 'rtl'
          }
        }));
      }
    }

    updateDocumentDirection() {
      if (typeof document === 'undefined') return;
      const langConfig = SUPPORTED_LANGUAGES[this.currentLang] || SUPPORTED_LANGUAGES.en;
      document.documentElement.lang = this.currentLang;
      document.documentElement.dir = langConfig.dir;
      if (langConfig.dir === 'rtl') {
        document.body.classList.add('rtl-layout');
      } else {
        document.body.classList.remove('rtl-layout');
      }
    }

    t(keyPath, params) {
      const keys = keyPath.split('.');
      let val = this.traverse(translations[this.currentLang], keys);

      if (val === undefined && this.currentLang !== 'en') {
        val = this.traverse(translations.en, keys);
      }

      if (val === undefined) {
        return keyPath;
      }

      if (params && typeof val === 'string') {
        return val.replace(/\{(\w+)\}/g, (match, p) => {
          return params[p] !== undefined ? params[p] : match;
        });
      }

      return val;
    }

    traverse(obj, keys) {
      let current = obj;
      for (const k of keys) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[k];
      }
      return current;
    }

    applyTranslations(rootElement) {
      if (typeof document === 'undefined') return;
      const root = rootElement || document;

      this.updateDocumentDirection();

      root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
          const translated = this.t(key);
          if (translated) el.textContent = translated;
        }
      });

      root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
          const translated = this.t(key);
          if (translated) el.setAttribute('title', translated);
        }
      });

      root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
          const translated = this.t(key);
          if (translated) el.setAttribute('placeholder', translated);
        }
      });

      root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        if (key) {
          const translated = this.t(key);
          if (translated) el.setAttribute('aria-label', translated);
        }
      });
    }

    populateLanguageSelector(selectElement) {
      if (!selectElement) return;
      selectElement.innerHTML = '';

      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.style.backgroundColor = '#121829';
      autoOption.style.color = '#f8fafc';
      const currentResolved = this.resolveLanguage();
      autoOption.textContent = `🌐 ${this.t('common.systemDefault')} (${SUPPORTED_LANGUAGES[currentResolved].nativeName})`;
      if (this.selectedPreference === 'auto') autoOption.selected = true;
      selectElement.appendChild(autoOption);

      for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
        const opt = document.createElement('option');
        opt.value = code;
        opt.style.backgroundColor = '#121829';
        opt.style.color = '#f8fafc';
        opt.textContent = `${info.nativeName} (${info.name})`;
        if (this.selectedPreference === code) opt.selected = true;
        selectElement.appendChild(opt);
      }

      if (!selectElement._i18nBound) {
        selectElement.addEventListener('change', (e) => {
          this.setLanguage(e.target.value);
        });
        selectElement._i18nBound = true;
      }
    }
  }

  const engine = new I18nEngine();
  engine.TRANSLATIONS = translations;
  return engine;
}));