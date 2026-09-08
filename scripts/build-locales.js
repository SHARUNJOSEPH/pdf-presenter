const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

const locales = {};
for (const file of files) {
  const lang = path.basename(file, '.json');
  const raw = fs.readFileSync(path.join(localesDir, file), 'utf8').replace(/^\uFEFF/, '');
  locales[lang] = JSON.parse(raw);
}

const header = '/**\n * Auto-generated Locales Bundle for PDF Presenter Suite\n * Supports instant, offline synchronous loading without CORS restrictions.\n */\n';
const bundle = header +
  '(function(root, factory) {\n' +
  '  if (typeof define === "function" && define.amd) {\n' +
  '    define([], factory);\n' +
  '  } else if (typeof module === "object" && module.exports) {\n' +
  '    const locs = factory();\n' +
  '    module.exports = locs;\n' +
  '    if (typeof root !== "undefined") root.I18N_LOCALES = locs;\n' +
  '  } else {\n' +
  '    root.I18N_LOCALES = factory();\n' +
  '  }\n' +
  '}(typeof self !== "undefined" ? self : this, function() {\n' +
  '  return ' + JSON.stringify(locales, null, 2) + ';\n' +
  '}));\n';

fs.writeFileSync(path.join(__dirname, '..', 'js', 'locales.js'), bundle, 'utf8');
console.log('js/locales.js successfully generated with', Object.keys(locales).length, 'languages!');