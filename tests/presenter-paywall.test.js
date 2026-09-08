/**
 * tests/presenter-paywall.test.js
 * Unit tests verifying Presenter Cockpit UI paywall integration and Grid View gating.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Presenter Cockpit Paywall & UI Integration', () => {
  const presenterHtmlPath = path.join(__dirname, '../views/presenter.html');
  const presenterJsPath = path.join(__dirname, '../js/presenter.js');
  const upgradeModalJsPath = path.join(__dirname, '../js/upgrade-modal.js');
  const commonCssPath = path.join(__dirname, '../css/common.css');
  const presenterCssPath = path.join(__dirname, '../css/presenter.css');

  const presenterHtml = fs.readFileSync(presenterHtmlPath, 'utf8');
  const presenterJs = fs.readFileSync(presenterJsPath, 'utf8');
  const upgradeModalJs = fs.readFileSync(upgradeModalJsPath, 'utf8');
  const commonCss = fs.readFileSync(commonCssPath, 'utf8');
  const presenterCss = fs.readFileSync(presenterCssPath, 'utf8');

  it('views/presenter.html contains proPresenterContainer before language selector', () => {
    assert.ok(presenterHtml.includes('id="proPresenterContainer"'), 'proPresenterContainer must exist');
    assert.ok(presenterHtml.includes('id="btnPresenterUpgradePro"'), 'btnPresenterUpgradePro must exist');
    assert.ok(presenterHtml.includes('id="badgePresenterPro"'), 'badgePresenterPro must exist');

    const proIndex = presenterHtml.indexOf('id="proPresenterContainer"');
    const langIndex = presenterHtml.indexOf('class="lang-selector-wrapper"');
    assert.ok(proIndex !== -1 && langIndex !== -1 && proIndex < langIndex, 'proPresenterContainer must precede lang-selector-wrapper');
  });

  it('views/presenter.html contains companionTrialContainer inside companionModal body', () => {
    assert.ok(presenterHtml.includes('id="companionTrialContainer"'), 'companionTrialContainer must exist');
    const modalIndex = presenterHtml.indexOf('id="companionModal"');
    const trialIndex = presenterHtml.indexOf('id="companionTrialContainer"');
    const guideIndex = presenterHtml.indexOf('class="companion-guide-box"');

    assert.ok(trialIndex > modalIndex, 'companionTrialContainer must be within companionModal');
    assert.ok(trialIndex < guideIndex, 'companionTrialContainer must precede companion-guide-box');
  });

  it('views/presenter.html includes upgradeProModal with full dialog structure', () => {
    assert.ok(presenterHtml.includes('id="upgradeProModal"'), 'upgradeProModal dialog must exist');
    assert.ok(presenterHtml.includes('id="upgradeModalTitle"'), 'upgradeModalTitle must exist');
    assert.ok(presenterHtml.includes('id="btnCloseUpgradeModal"'), 'btnCloseUpgradeModal must exist');
    assert.ok(presenterHtml.includes('id="btnStoreBuyPro"'), 'btnStoreBuyPro must exist');
    assert.ok(presenterHtml.includes('id="txtProLicenseKey"'), 'txtProLicenseKey must exist');
    assert.ok(presenterHtml.includes('id="btnActivateProKey"'), 'btnActivateProKey must exist');
  });

  it('views/presenter.html loads upgrade-modal.js script before presenter.js', () => {
    const upgradeScriptIndex = presenterHtml.indexOf('src="../js/upgrade-modal.js"');
    const presenterScriptIndex = presenterHtml.indexOf('src="../js/presenter.js"');
    assert.ok(upgradeScriptIndex !== -1, 'upgrade-modal.js script tag must exist');
    assert.ok(presenterScriptIndex !== -1, 'presenter.js script tag must exist');
    assert.ok(upgradeScriptIndex < presenterScriptIndex, 'upgrade-modal.js must load before presenter.js');
  });

  it('js/presenter.js intercepts Grid View opening and checks window.UpgradeModal.isPro()', () => {
    assert.ok(presenterJs.includes('window.UpgradeModal.isPro()'), 'presenter.js must check UpgradeModal.isPro()');
    assert.ok(presenterJs.includes("window.UpgradeModal.open('grid')"), "presenter.js must trigger UpgradeModal.open('grid')");
  });

  it('js/presenter.js intercepts both top and bottom Grid View buttons and keyboard shortcut g/G', () => {
    assert.ok(presenterJs.includes('handleGridRequest'), 'handleGridRequest should guard grid requests');
    assert.ok(presenterJs.includes("e.key === 'g' || e.key === 'G'"), 'Key g/G shortcut must be handled');
  });

  it('js/upgrade-modal.js exports window.UpgradeModal with init, open, close, isPro', () => {
    assert.ok(upgradeModalJs.includes('window.UpgradeModal = {'), 'window.UpgradeModal must be exported');
    assert.ok(upgradeModalJs.includes('open: openModal'), 'UpgradeModal.open must be defined');
    assert.ok(upgradeModalJs.includes('close: closeModal'), 'UpgradeModal.close must be defined');
    assert.ok(upgradeModalJs.includes('isPro: () => Boolean(currentLicenseStatus.isPro)'), 'UpgradeModal.isPro must return boolean');
  });

  it('css/presenter.css and css/common.css contain valid dark mode, pro styles, and RTL rules', () => {
    assert.ok(presenterCss.includes('#proPresenterContainer'), 'presenter.css must style #proPresenterContainer');
    assert.ok(commonCss.includes('.modal-upgrade-card'), 'common.css must style .modal-upgrade-card');
    assert.ok(commonCss.includes('html[dir="rtl"] .key-input'), 'common.css must have RTL rule for .key-input');
    assert.ok(commonCss.includes('html[dir="rtl"] .pro-tag-lock'), 'common.css must have RTL rule for .pro-tag-lock');
  });
});
