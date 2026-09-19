/**
 * js/upgrade-modal.js - Shared Freemium & Pro Upgrade Controller
 * Handles upgrade modal display, Store deep linking, license key activation,
 * and real-time synchronization between Free and Pro tiers.
 */

(function(window) {
  'use strict';

  let currentLicenseStatus = {
    isPro: false,
    tier: 'free',
    companionAuthorized: false,
    trialActive: false,
    trialRemainingSeconds: 0
  };

  /**
   * Render or update UI based on license status
   */
  function applyLicenseStatus(status) {
    if (!status) return;
    currentLicenseStatus = status;

    const isPro = Boolean(status.isPro);

    // 1. Header Buttons & Badges (Launcher & Presenter)
    const upgradeBtns = document.querySelectorAll('.btn-upgrade-pro');
    const proBadges = document.querySelectorAll('.pro-badge-pill');

    upgradeBtns.forEach(btn => {
      btn.style.setProperty('display', isPro ? 'none' : 'inline-flex', 'important');
    });

    proBadges.forEach(badge => {
      badge.style.setProperty('display', isPro ? 'inline-flex' : 'none', 'important');
    });

    // 2. Lock tags on Pro features
    const lockTags = document.querySelectorAll('.pro-tag-lock');
    lockTags.forEach(tag => {
      tag.style.setProperty('display', isPro ? 'none' : 'inline-flex', 'important');
    });

    // 3. Companion Modal Trial & Pro indicator
    const companionTrialContainer = document.getElementById('companionTrialContainer');
    if (companionTrialContainer) {
      if (isPro) {
        companionTrialContainer.innerHTML = `
          <div class="pro-badge-pill" style="margin-bottom: 10px;">
            <span>💎</span> <span>PRO LICENSE ACTIVE • UNRESTRICTED AV CONTROL</span>
          </div>
        `;
      } else if (status.trialActive && status.trialRemainingSeconds > 0) {
        const m = Math.floor(status.trialRemainingSeconds / 60);
        const s = (status.trialRemainingSeconds % 60).toString().padStart(2, '0');
        const trialBadgeText = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('pro.trialBadge') : '15-Min Trial Active';
        const upgradeBtnText = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('pro.upgradeBtn') : 'Upgrade to Pro';
        companionTrialContainer.innerHTML = `
          <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: var(--radius-md); padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #fef08a;">
              <span>⏱️</span> <strong>${trialBadgeText}:</strong> <span>${m}:${s} remaining</span>
            </div>
            <button type="button" class="btn btn-upgrade-pro" style="padding: 4px 10px !important; font-size: 11.5px !important;" onclick="window.UpgradeModal.open('companion')">
              <span>💎</span> ${upgradeBtnText}
            </button>
          </div>
        `;
      } else {
        const startTrialText = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('pro.startTrial') : 'Start 15-Min Trial';
        const upgradeBtnText = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('pro.upgradeBtn') : 'Upgrade to Pro';
        companionTrialContainer.innerHTML = `
          <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: var(--radius-md); padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #cbd5e1;">
              <span>🔒</span> <span>Pro Feature. Control slides from Elgato Stream Deck & Bitfocus Companion.</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary" id="btnStartTrialInner" style="padding: 5px 12px; font-size: 12px;">
                <span>⏱️</span> ${startTrialText}
              </button>
              <button type="button" class="btn btn-upgrade-pro" style="padding: 5px 12px !important; font-size: 12px !important;" onclick="window.UpgradeModal.open('companion')">
                <span>💎</span> ${upgradeBtnText}
              </button>
            </div>
          </div>
        `;

        const btnStart = companionTrialContainer.querySelector('#btnStartTrialInner');
        if (btnStart) {
          btnStart.addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.startCompanionTrial) {
              const res = await window.electronAPI.startCompanionTrial();
              if (res && res.success) {
                const refreshed = await window.electronAPI.getLicenseStatus();
                applyLicenseStatus(refreshed);
              }
            }
          });
        }
      }
    }

    // 4. About Modal Edition Switcher Component
    const aboutEditionPill = document.getElementById('aboutEditionPill');
    const btnSelectFree = document.getElementById('btnSelectFreeEdition');
    const btnSelectPro = document.getElementById('btnSelectProEdition');
    const iconFreeCheck = document.getElementById('iconFreeCheck');
    const iconProCheck = document.getElementById('iconProCheck');
    const aboutDesc = document.getElementById('aboutActiveEditionDesc');
    const vaultStatus = document.getElementById('aboutLicenseVaultStatus');
    const btnForget = document.getElementById('btnForgetLicense');

    if (aboutEditionPill) {
      if (isPro) {
        aboutEditionPill.textContent = 'PRO EDITION';
        aboutEditionPill.className = 'edition-status-pill pill-pro';
        if (btnSelectPro) btnSelectPro.classList.add('active-pro');
        if (btnSelectFree) btnSelectFree.classList.remove('active-free');
        if (iconProCheck) iconProCheck.style.display = 'inline';
        if (iconFreeCheck) iconFreeCheck.style.display = 'none';
        if (aboutDesc) aboutDesc.textContent = 'Enterprise Pro Edition is currently active with full AV features.';
      } else {
        aboutEditionPill.textContent = 'FREE COMMUNITY';
        aboutEditionPill.className = 'edition-status-pill pill-free';
        if (btnSelectFree) btnSelectFree.classList.add('active-free');
        if (btnSelectPro) btnSelectPro.classList.remove('active-pro');
        if (iconFreeCheck) iconFreeCheck.style.display = 'inline';
        if (iconProCheck) iconProCheck.style.display = 'none';
        if (aboutDesc) aboutDesc.textContent = 'Community Free Edition is active. Clean, prompt-free presentation.';
      }

      if (vaultStatus) {
        if (status.hasStoredKey) {
          vaultStatus.textContent = isPro
            ? '🔑 Enterprise Pro license active on this device'
            : '🔑 License key saved in vault (Click Enterprise Pro to restore)';
          if (btnForget) {
            btnForget.style.display = 'inline-block';
            btnForget.textContent = '🗑️ Remove Key';
          }
        } else {
          vaultStatus.textContent = '🔒 No Pro license key stored on this device.';
          if (btnForget) btnForget.style.display = 'none';
        }
      }
    }
  }

  /**
   * Open the Upgrade to Pro modal
   */
  function openModal(highlightReason = '', force = false) {
    // If user explicitly switched to Free Community mode, suppress automatic sales prompts
    if (!force && currentLicenseStatus.suppressProPrompts && highlightReason) {
      console.log(`[Pro Feature] ${highlightReason} requested in Free Community Clean Mode.`);
      return;
    }

    // Ensure any open About dialog is closed so Upgrade Pro modal is completely unobstructed
    const aboutModal = document.getElementById('aboutModal');
    if (aboutModal && aboutModal.classList.contains('open')) {
      aboutModal.classList.remove('open');
    }

    const modal = document.getElementById('upgradeProModal');
    if (!modal) return;

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('open');
    });

    // Clear previous input status
    const keyMsg = document.getElementById('upgradeKeyMsg');
    if (keyMsg) keyMsg.textContent = '';
    const keyInput = document.getElementById('txtProLicenseKey');
    if (keyInput) keyInput.value = '';

    // Contextual feature highlight
    modal.querySelectorAll('.pro-feature-item').forEach(item => {
      item.style.borderColor = '';
      item.style.background = '';
      item.style.boxShadow = '';
    });

    if (highlightReason === 'grid') {
      const gridFeature = modal.querySelector('[data-i18n="pro.featureGrid"]')?.closest('.pro-feature-item');
      if (gridFeature) {
        gridFeature.style.borderColor = 'rgba(236, 72, 153, 0.7)';
        gridFeature.style.background = 'rgba(236, 72, 153, 0.15)';
        gridFeature.style.boxShadow = '0 0 16px rgba(236, 72, 153, 0.35)';
      }
    } else if (highlightReason === 'companion') {
      const compFeature = modal.querySelector('[data-i18n="pro.featureCompanion"]')?.closest('.pro-feature-item');
      if (compFeature) {
        compFeature.style.borderColor = 'rgba(99, 102, 241, 0.7)';
        compFeature.style.background = 'rgba(99, 102, 241, 0.18)';
        compFeature.style.boxShadow = '0 0 16px rgba(99, 102, 241, 0.35)';
      }
    }

    // Re-apply localization
    if (window.i18n && typeof window.i18n.translatePage === 'function') {
      window.i18n.translatePage();
    }
  }

  /**
   * Close the Upgrade to Pro modal
   */
  function closeModal() {
    const modal = document.getElementById('upgradeProModal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => {
        if (!modal.classList.contains('open')) {
          modal.style.display = 'none';
        }
      }, 200);
    }
  }

  /**
   * Initialize modal events and load initial license state
   */
  async function init() {
    const modal = document.getElementById('upgradeProModal');
    if (!modal) return;

    // Close button
    const btnClose = document.getElementById('btnCloseUpgradeModal');
    if (btnClose) {
      btnClose.addEventListener('click', closeModal);
    }

    // Click outside to dismiss
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // Escape key listener
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && (modal.classList.contains('open') || modal.style.display === 'flex')) {
        closeModal();
      }
    });

    // Purchase on Microsoft Store button
    const btnBuy = document.getElementById('btnStoreBuyPro');
    if (btnBuy) {
      btnBuy.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.purchasePro) {
          await window.electronAPI.purchasePro();
        }
      });
    }

    // Toggle license key input row
    const btnToggleKey = document.getElementById('btnToggleKeyAccordion');
    const keyInputRow = document.getElementById('keyInputRowContainer');
    if (btnToggleKey && keyInputRow) {
      btnToggleKey.addEventListener('click', () => {
        const isHidden = keyInputRow.style.display === 'none' || !keyInputRow.style.display;
        keyInputRow.style.display = isHidden ? 'block' : 'none';
      });
    }

    // Activate License Key button
    const btnActivate = document.getElementById('btnActivateProKey');
    const keyInput = document.getElementById('txtProLicenseKey');
    const keyMsg = document.getElementById('upgradeKeyMsg');

    if (btnActivate && keyInput && keyMsg) {
      btnActivate.addEventListener('click', async () => {
        const rawKey = keyInput.value.trim();
        if (!rawKey) return;

        keyMsg.className = 'key-msg-container';
        keyMsg.textContent = 'Verifying key...';

        if (window.electronAPI && window.electronAPI.activateLicenseKey) {
          const res = await window.electronAPI.activateLicenseKey(rawKey);
          if (res && res.success) {
            keyMsg.className = 'key-msg-container key-msg-success';
            keyMsg.textContent = window.i18n ? window.i18n.t('pro.keySuccess') : 'Pro features unlocked successfully!';
            applyLicenseStatus(res.state);
            setTimeout(() => {
              closeModal();
            }, 1200);
          } else {
            keyMsg.className = 'key-msg-container key-msg-error';
            keyMsg.textContent = window.i18n ? window.i18n.t('pro.keyInvalid') : 'Invalid license key. Please check and try again.';
          }
        }
      });

      keyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          btnActivate.click();
        }
      });
    }

    // Global Header Upgrade Buttons
    document.querySelectorAll('.btn-upgrade-pro').forEach(btn => {
      btn.addEventListener('click', () => openModal('', true));
    });

    // About Modal Edition Switcher Listeners
    const btnSelectFree = document.getElementById('btnSelectFreeEdition');
    const btnSelectPro = document.getElementById('btnSelectProEdition');
    const btnForget = document.getElementById('btnForgetLicense');

    if (btnSelectFree) {
      btnSelectFree.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.setEdition) {
          const res = await window.electronAPI.setEdition('free');
          if (res && res.state) {
            applyLicenseStatus(res.state);
          }
        }
      });
    }

    if (btnSelectPro) {
      btnSelectPro.addEventListener('click', async () => {
        // If there is no active Pro license and no key stored in the vault,
        // strictly prevent switching and immediately prompt to buy Pro with the popping window!
        const hasKey = Boolean(
          currentLicenseStatus.isPro ||
          currentLicenseStatus.hasStoredKey
        );

        if (!hasKey) {
          const aboutModal = document.getElementById('aboutModal');
          if (aboutModal) aboutModal.classList.remove('open');
          openModal('edition_switch', true);
          return;
        }

        if (window.electronAPI && window.electronAPI.setEdition) {
          const res = await window.electronAPI.setEdition('pro');
          if (res && res.state) {
            applyLicenseStatus(res.state);
            if (!res.state.isPro) {
              const aboutModal = document.getElementById('aboutModal');
              if (aboutModal) aboutModal.classList.remove('open');
              openModal('edition_switch', true);
            }
          } else if (res && !res.success) {
            const aboutModal = document.getElementById('aboutModal');
            if (aboutModal) aboutModal.classList.remove('open');
            openModal('edition_switch', true);
          }
        }
      });
    }

    if (btnForget) {
      btnForget.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.forgetLicense) {
          const res = await window.electronAPI.forgetLicense();
          if (res && res.state) {
            applyLicenseStatus(res.state);
          }
        }
      });
    }

    // Fetch initial license status
    if (window.electronAPI && window.electronAPI.getLicenseStatus) {
      const initialStatus = await window.electronAPI.getLicenseStatus();
      applyLicenseStatus(initialStatus);

      // Listen for runtime broadcasts
      window.electronAPI.onLicenseChanged((newStatus) => {
        applyLicenseStatus(newStatus);
      });
    }

    // Periodic check for trial countdown tick if trial active
    setInterval(async () => {
      if (!currentLicenseStatus.isPro && currentLicenseStatus.trialActive) {
        if (window.electronAPI && window.electronAPI.getLicenseStatus) {
          const updated = await window.electronAPI.getLicenseStatus();
          applyLicenseStatus(updated);
        }
      }
    }, 5000);
  }

  // Export to global window
  window.UpgradeModal = {
    init: init,
    open: openModal,
    close: closeModal,
    getStatus: () => ({ ...currentLicenseStatus }),
    isPro: () => Boolean(currentLicenseStatus.isPro)
  };

  // Deeply freeze and lock window.UpgradeModal against runtime console tampering
  try {
    Object.freeze(window.UpgradeModal);
    Object.defineProperty(window, 'UpgradeModal', {
      value: window.UpgradeModal,
      writable: false,
      configurable: false
    });
  } catch (e) {}

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
