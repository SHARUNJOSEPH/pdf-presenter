/**
 * js/watermark-banner.js
 * Watermark & Event Branding Engine + Live Audience Lower-Third Ticker Banner
 * PDF Presenter Suite (Enterprise Pro AV Features)
 */

(function(global) {
  'use strict';

  const STORAGE_KEY_WATERMARK = 'pdf_presenter_watermark_config';
  const STORAGE_KEY_BANNER_TARGET = 'pdf_presenter_live_message_target';
  const VALID_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

  class WatermarkBannerEngine {
    constructor() {
      this.watermarkState = {
        enabled: false,
        text: '',
        imageUrl: '',
        position: 'bottom-right',
        opacity: 0.8,
        scale: 1.0
      };

      let initialTarget = 'audience';
      if (typeof localStorage !== 'undefined') {
        const storedTgt = localStorage.getItem(STORAGE_KEY_BANNER_TARGET);
        if (storedTgt) initialTarget = storedTgt;
      }

      this.bannerState = {
        active: false,
        message: '',
        duration: 0, // 0 = sticky
        displayMode: 'sticky',
        target: initialTarget // 'audience' (default), 'presenter', 'stage', 'all'
      };

      this.syncBus = null;
      this.isInitialized = false;

      this.loadStoredWatermark();
    }

    /**
     * Check Pro feature entitlement via UpgradeModal
     */
    isPro() {
      if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.isPro === 'function') {
        return window.UpgradeModal.isPro();
      }
      return true; // Default fallback in non-browser or standalone envs
    }

    /**
     * Trigger Pro upgrade modal if user is free tier
     */
    guardPro(feature = 'branding') {
      if (!this.isPro()) {
        if (typeof window !== 'undefined' && window.UpgradeModal && typeof window.UpgradeModal.open === 'function') {
          window.UpgradeModal.open(feature);
        }
        return false;
      }
      return true;
    }

    /**
     * Set or obtain the PresentationSyncBus instance
     */
    getSyncBus() {
      if (this.syncBus) return this.syncBus;
      if (typeof window !== 'undefined') {
        if (window.presentationSyncBus) {
          this.syncBus = window.presentationSyncBus;
          return this.syncBus;
        }
        if (typeof PresentationSyncBus !== 'undefined') {
          try {
            this.syncBus = new PresentationSyncBus('presenter');
            window.presentationSyncBus = this.syncBus;
            return this.syncBus;
          } catch (e) {}
        }
      }
      return null;
    }

    /**
     * Broadcast an event across PresentationSyncBus and Electron IPC
     */
    broadcast(event) {
      if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.sendSync === 'function') {
        try {
          window.electronAPI.sendSync(event);
        } catch (e) {
          console.warn('[WatermarkBannerEngine] electronAPI.sendSync failed:', e);
        }
      }

      const bus = this.getSyncBus();
      if (bus && typeof bus.send === 'function') {
        try {
          bus.send(event);
        } catch (e) {
          console.warn('[WatermarkBannerEngine] syncBus.send failed:', e);
        }
      }
    }

    // =========================================================================
    // A. WATERMARK STATE & BROADCASTING
    // =========================================================================

    loadStoredWatermark() {
      if (typeof localStorage === 'undefined') return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_WATERMARK);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.setWatermark(parsed, false);
        }
      } catch (e) {}
    }

    saveStoredWatermark() {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_KEY_WATERMARK, JSON.stringify(this.watermarkState));
      } catch (e) {}
    }

    getWatermarkState() {
      return { ...this.watermarkState };
    }

    setWatermark(config = {}, shouldBroadcast = true) {
      if (config.enabled !== undefined) {
        this.watermarkState.enabled = Boolean(config.enabled);
      }
      if (typeof config.text === 'string') {
        this.watermarkState.text = config.text.trim();
      }
      if (typeof config.imageUrl === 'string') {
        this.watermarkState.imageUrl = config.imageUrl.trim();
      }
      if (config.position && VALID_POSITIONS.includes(config.position)) {
        this.watermarkState.position = config.position;
      }
      if (typeof config.opacity === 'number' || !isNaN(Number(config.opacity))) {
        const op = Number(config.opacity);
        this.watermarkState.opacity = Math.max(0.1, Math.min(1.0, op));
      }
      if (typeof config.scale === 'number' || !isNaN(Number(config.scale))) {
        const sc = Number(config.scale);
        this.watermarkState.scale = Math.max(0.5, Math.min(1.5, sc));
      }

      this.saveStoredWatermark();

      if (shouldBroadcast) {
        this.broadcastWatermark();
      }

      return this.getWatermarkState();
    }

    broadcastWatermark() {
      this.broadcast({
        type: 'SET_WATERMARK',
        config: this.getWatermarkState()
      });
    }

    // =========================================================================
    // B. AUDIENCE BANNER STATE & BROADCASTING
    // =========================================================================

    getBannerTarget() {
      return this.bannerState.target || 'audience';
    }

    setBannerTarget(target) {
      const valid = ['audience', 'presenter', 'cockpit', 'stage', 'confidence', 'all'];
      const tgt = typeof target === 'string' && valid.includes(target.toLowerCase()) ? target.toLowerCase() : 'audience';
      this.bannerState.target = tgt;
      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(STORAGE_KEY_BANNER_TARGET, tgt); } catch (e) {}
      }
      return this.bannerState.target;
    }

    getBannerState() {
      return { ...this.bannerState };
    }

    showBanner(message, duration = 0, target = null) {
      const msg = typeof message === 'string' ? message.trim() : '';
      const dur = Math.max(0, Number(duration || 0));
      const tgt = String(target || this.bannerState.target || 'audience').toLowerCase();

      this.bannerState.active = true;
      this.bannerState.message = msg;
      this.bannerState.duration = dur;
      this.bannerState.displayMode = dur > 0 ? 'auto' : 'sticky';
      this.bannerState.target = tgt;

      if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(STORAGE_KEY_BANNER_TARGET, tgt); } catch (e) {}
      }

      const durMs = dur > 0 ? dur * 1000 : 10000;

      if (tgt === 'presenter' || tgt === 'cockpit') {
        this.broadcast({
          type: 'PRESENTER_ALERT',
          message: msg,
          duration: durMs,
          target: 'presenter',
          source: 'watermark_banner_tool'
        });
      } else if (tgt === 'audience') {
        this.broadcast({
          type: 'SHOW_BANNER',
          message: msg,
          duration: dur,
          target: 'audience',
          source: 'watermark_banner_tool'
        });
      } else if (tgt === 'stage' || tgt === 'confidence') {
        this.broadcast({
          type: 'STAGE_CUE',
          message: msg,
          duration: durMs,
          target: 'stage',
          source: 'watermark_banner_tool'
        });
      } else if (tgt === 'all') {
        this.broadcast({
          type: 'PRESENTER_ALERT',
          message: msg,
          duration: durMs,
          target: 'presenter',
          source: 'watermark_banner_tool'
        });
        this.broadcast({
          type: 'SHOW_BANNER',
          message: msg,
          duration: dur,
          target: 'audience',
          source: 'watermark_banner_tool'
        });
        this.broadcast({
          type: 'STAGE_CUE',
          message: msg,
          duration: durMs,
          target: 'stage',
          source: 'watermark_banner_tool'
        });
      }

      this.updateBannerModalStatus();
      return this.getBannerState();
    }

    hideBanner(target = null) {
      const tgt = String(target || this.bannerState.target || 'audience').toLowerCase();
      this.bannerState.active = false;
      this.bannerState.message = '';
      this.bannerState.duration = 0;
      this.bannerState.displayMode = 'sticky';

      if (tgt === 'presenter' || tgt === 'cockpit') {
        this.broadcast({ type: 'CLEAR_PRESENTER_ALERT', source: 'watermark_banner_tool' });
      } else if (tgt === 'audience') {
        this.broadcast({ type: 'HIDE_BANNER', source: 'watermark_banner_tool' });
      } else if (tgt === 'stage' || tgt === 'confidence') {
        this.broadcast({ type: 'STAGE_CUE', message: '', duration: 0, source: 'watermark_banner_tool' });
      } else {
        this.broadcast({ type: 'CLEAR_PRESENTER_ALERT', source: 'watermark_banner_tool' });
        this.broadcast({ type: 'HIDE_BANNER', source: 'watermark_banner_tool' });
        this.broadcast({ type: 'STAGE_CUE', message: '', duration: 0, source: 'watermark_banner_tool' });
      }

      this.updateBannerModalStatus();
      return this.getBannerState();
    }

    // =========================================================================
    // C. PRESENTER MODAL CONTROLLERS & UI INTEGRATION
    // =========================================================================

    openWatermarkModal() {
      if (!this.guardPro('watermark')) return false;
      if (typeof document === 'undefined') return false;

      const modal = document.getElementById('watermarkModal');
      if (!modal) return false;

      this.populateWatermarkModal();
      modal.classList.add('open');
      return true;
    }

    closeWatermarkModal() {
      if (typeof document === 'undefined') return;
      const modal = document.getElementById('watermarkModal');
      if (modal) modal.classList.remove('open');
    }

    openAudienceBannerModal() {
      if (!this.guardPro('banner')) return false;
      if (typeof document === 'undefined') return false;

      const modal = document.getElementById('audienceBannerModal');
      if (!modal) return false;

      this.populateBannerModal();
      modal.classList.add('open');
      return true;
    }

    closeAudienceBannerModal() {
      if (typeof document === 'undefined') return;
      const modal = document.getElementById('audienceBannerModal');
      if (modal) modal.classList.remove('open');
    }

    populateWatermarkModal() {
      if (typeof document === 'undefined') return;
      const state = this.getWatermarkState();
      const chkEnabled = document.getElementById('watermarkEnabled');
      const txtInput = document.getElementById('watermarkTextInput');
      const urlInput = document.getElementById('watermarkUrlInput');
      const posSelect = document.getElementById('watermarkPositionSelect');
      const opacityRange = document.getElementById('watermarkOpacityRange');
      const opacityVal = document.getElementById('watermarkOpacityVal');
      const scaleRange = document.getElementById('watermarkScaleRange');
      const scaleVal = document.getElementById('watermarkScaleVal');
      const previewContainer = document.getElementById('watermarkImagePreviewContainer');
      const previewImg = document.getElementById('watermarkImagePreview');

      if (chkEnabled) {
        chkEnabled.checked = Boolean(state.enabled);
        this.updateWatermarkToggleBadge(state.enabled);
      }
      if (txtInput) txtInput.value = state.text || '';
      if (urlInput) urlInput.value = state.imageUrl || '';
      if (posSelect) posSelect.value = state.position || 'bottom-right';
      if (opacityRange) {
        opacityRange.value = state.opacity;
        if (opacityVal) opacityVal.textContent = state.opacity.toFixed(2);
      }
      if (scaleRange) {
        scaleRange.value = state.scale;
        if (scaleVal) scaleVal.textContent = state.scale.toFixed(2) + 'x';
      }

      if (state.imageUrl && previewImg && previewContainer) {
        previewImg.src = state.imageUrl;
        previewContainer.style.display = 'block';
      } else if (previewContainer) {
        previewContainer.style.display = 'none';
      }

      const isImg = Boolean(state.imageUrl && !state.text);
      this.switchWatermarkTab(isImg ? 'image' : 'text');
      this.updateWatermarkPreview();
    }

    /**
     * Update the visual status badge, toggle row active state, and mock slide preview dimming
     */
    updateWatermarkToggleBadge(enabled) {
      if (typeof document === 'undefined') return;
      const isChecked = Boolean(enabled);
      const badge = document.getElementById('watermarkStatusBadge');
      const row = document.getElementById('watermarkToggleRow');
      const disabledBanner = document.getElementById('watermarkDisabledBanner');
      const previewElement = document.getElementById('watermarkPreviewElement');
      const chk = document.getElementById('watermarkEnabled');

      if (chk && chk.checked !== isChecked) {
        chk.checked = isChecked;
      }
      if (badge) {
        badge.className = `watermark-status-badge ${isChecked ? 'badge-on' : 'badge-off'}`;
        badge.textContent = isChecked ? '✓ Active' : 'Disabled';
      }
      if (row) {
        row.classList.toggle('active', isChecked);
      }
      if (disabledBanner) {
        disabledBanner.style.display = isChecked ? 'none' : 'flex';
      }
      if (previewElement) {
        const opVal = Number(document.getElementById('watermarkOpacityRange')?.value || 0.8);
        previewElement.style.opacity = isChecked ? opVal : 0.2;
      }
    }

    /**
     * Dynamically update the live watermark mock slide preview in real-time
     */
    updateWatermarkPreview() {
      if (typeof document === 'undefined') return;
      const previewElement = document.getElementById('watermarkPreviewElement');
      const previewText = document.getElementById('watermarkPreviewText');
      const previewImg = document.getElementById('watermarkPreviewImg');
      if (!previewElement) return;

      const chkEnabled = document.getElementById('watermarkEnabled');
      const isEnabled = chkEnabled ? chkEnabled.checked : this.watermarkState.enabled;
      this.updateWatermarkToggleBadge(isEnabled);

      const isImageMode = document.getElementById('btnWatermarkTypeImage')?.classList.contains('active');
      const txtVal = document.getElementById('watermarkTextInput')?.value || 'CONFIDENTIAL';
      const urlVal = document.getElementById('watermarkUrlInput')?.value || '';
      const posVal = document.getElementById('watermarkPositionSelect')?.value || 'bottom-right';
      const opVal = Number(document.getElementById('watermarkOpacityRange')?.value || 0.8);
      const scVal = Number(document.getElementById('watermarkScaleRange')?.value || 1.0);

      // 1. Update corner position class
      previewElement.className = 'watermark-preview-corner-element pos-' + posVal;

      // 2. Update real-time opacity and scale
      previewElement.style.opacity = isEnabled ? opVal : 0.2;
      previewElement.style.transform = `scale(${scVal})`;

      // 3. Update preview content (text vs image logo)
      if (isImageMode && urlVal) {
        if (previewImg) {
          previewImg.src = urlVal;
          previewImg.style.display = 'block';
        }
        if (previewText) {
          previewText.style.display = 'none';
        }
      } else {
        if (previewImg) {
          previewImg.style.display = 'none';
        }
        if (previewText) {
          previewText.textContent = txtVal || 'PREVIEW';
          previewText.style.display = 'inline-block';
        }
      }
    }

    switchWatermarkTab(type) {
      if (typeof document === 'undefined') return;
      const btnText = document.getElementById('btnWatermarkTypeText');
      const btnImg = document.getElementById('btnWatermarkTypeImage');
      const textGroup = document.getElementById('watermarkTextGroup');
      const imgGroup = document.getElementById('watermarkImageGroup');

      if (type === 'image') {
        if (btnImg) btnImg.classList.add('active');
        if (btnText) btnText.classList.remove('active');
        if (imgGroup) imgGroup.style.display = 'block';
        if (textGroup) textGroup.style.display = 'none';
      } else {
        if (btnText) btnText.classList.add('active');
        if (btnImg) btnImg.classList.remove('active');
        if (textGroup) textGroup.style.display = 'block';
        if (imgGroup) imgGroup.style.display = 'none';
      }

      this.updateWatermarkPreview();
    }

    populateBannerModal() {
      if (typeof document === 'undefined') return;
      const state = this.getBannerState();
      const txtInput = document.getElementById('bannerMessageInput');
      if (txtInput && !txtInput.value && state.message) {
        txtInput.value = state.message;
      }

      // Synchronize target display selector with saved preference
      const savedTarget = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_BANNER_TARGET)) || this.bannerState.target || 'presenter';
      const targetSelect = document.getElementById('bannerTargetSelect');
      if (targetSelect) {
        targetSelect.value = savedTarget;
      }
      const streamDeckSelect = document.getElementById('selStreamDeckTarget');
      if (streamDeckSelect) {
        streamDeckSelect.value = savedTarget;
      }

      // Synchronize duration button active state
      const durationButtons = document.querySelectorAll('.btn-duration');
      durationButtons.forEach(btn => {
        if (Number(btn.dataset.duration || 0) === this.bannerState.duration) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      this.updateBannerModalStatus();
    }

    updateBannerModalStatus() {
      if (typeof document === 'undefined') return;
      const dot = document.getElementById('bannerStatusDot');
      const text = document.getElementById('bannerStatusText');
      const btnDismiss = document.getElementById('btnDismissBanner');

      const targetLabels = {
        presenter: 'Presenter Cockpit',
        audience: 'Audience Ticker',
        stage: 'Stage Monitor',
        all: 'All Displays'
      };
      const label = targetLabels[this.bannerState.target] || 'Selected Display';

      if (this.bannerState.active) {
        if (dot) dot.style.background = '#22c55e';
        if (text) text.textContent = `Broadcasting live to ${label}: "${this.bannerState.message}" ${this.bannerState.duration > 0 ? `(${this.bannerState.duration}s auto-dismiss)` : '(Sticky)'}`;
        if (btnDismiss) btnDismiss.style.display = 'inline-block';
      } else {
        if (dot) dot.style.background = '#64748b';
        if (text) text.textContent = 'Banner is currently hidden';
        if (btnDismiss) btnDismiss.style.display = 'none';
      }
    }

    init() {
      if (this.isInitialized) return;
      this.isInitialized = true;

      // Wire Presenter View Trigger Buttons
      const btnWatermark = document.getElementById('btnWatermark');
      if (btnWatermark) {
        btnWatermark.addEventListener('click', () => this.openWatermarkModal());
      }

      const btnAudienceBanner = document.getElementById('btnAudienceBanner');
      if (btnAudienceBanner) {
        btnAudienceBanner.addEventListener('click', () => this.openAudienceBannerModal());
      }

      // Wire Watermark Modal Controls
      const btnTypeText = document.getElementById('btnWatermarkTypeText');
      const btnTypeImage = document.getElementById('btnWatermarkTypeImage');
      if (btnTypeText) btnTypeText.addEventListener('click', () => this.switchWatermarkTab('text'));
      if (btnTypeImage) btnTypeImage.addEventListener('click', () => this.switchWatermarkTab('image'));

      const opacityRange = document.getElementById('watermarkOpacityRange');
      const opacityVal = document.getElementById('watermarkOpacityVal');
      if (opacityRange && opacityVal) {
        opacityRange.addEventListener('input', () => {
          opacityVal.textContent = Number(opacityRange.value).toFixed(2);
          this.updateWatermarkPreview();
        });
      }

      const scaleRange = document.getElementById('watermarkScaleRange');
      const scaleVal = document.getElementById('watermarkScaleVal');
      if (scaleRange && scaleVal) {
        scaleRange.addEventListener('input', () => {
          scaleVal.textContent = Number(scaleRange.value).toFixed(2) + 'x';
          this.updateWatermarkPreview();
        });
      }

      const posSelect = document.getElementById('watermarkPositionSelect');
      if (posSelect) {
        posSelect.addEventListener('change', () => this.updateWatermarkPreview());
      }

      const txtInput = document.getElementById('watermarkTextInput');
      if (txtInput) {
        txtInput.addEventListener('input', () => this.updateWatermarkPreview());
      }

      const fileInput = document.getElementById('watermarkFileInput');
      const btnUploadFile = document.getElementById('btnUploadWatermarkFile');
      const urlInput = document.getElementById('watermarkUrlInput');
      const previewContainer = document.getElementById('watermarkImagePreviewContainer');
      const previewImg = document.getElementById('watermarkImagePreview');

      if (btnUploadFile && fileInput) {
        btnUploadFile.addEventListener('click', () => fileInput.click());
      }

      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const dataUrl = evt.target.result;
              if (urlInput) urlInput.value = dataUrl;
              if (previewImg && previewContainer) {
                previewImg.src = dataUrl;
                previewContainer.style.display = 'block';
              }
              this.updateWatermarkPreview();
            };
            reader.readAsDataURL(file);
          }
        });
      }

      if (urlInput) {
        urlInput.addEventListener('input', () => {
          const val = urlInput.value.trim();
          if (val && previewImg && previewContainer) {
            previewImg.src = val;
            previewContainer.style.display = 'block';
          } else if (previewContainer) {
            previewContainer.style.display = 'none';
          }
          this.updateWatermarkPreview();
        });
      }

      const chkWatermarkEnabled = document.getElementById('watermarkEnabled');
      if (chkWatermarkEnabled) {
        chkWatermarkEnabled.addEventListener('change', () => {
          this.updateWatermarkToggleBadge(chkWatermarkEnabled.checked);
          this.updateWatermarkPreview();
        });
      }

      const btnApplyWatermark = document.getElementById('btnApplyWatermark');
      if (btnApplyWatermark) {
        btnApplyWatermark.addEventListener('click', () => {
          if (!this.guardPro('watermark')) return;

          const chkEnabled = document.getElementById('watermarkEnabled');
          // If the user clicks Apply to Screen, automatically ensure it is enabled
          if (chkEnabled && !chkEnabled.checked) {
            chkEnabled.checked = true;
          }
          const isEnabled = chkEnabled ? chkEnabled.checked : true;
          this.updateWatermarkToggleBadge(isEnabled);

          const isImageMode = document.getElementById('btnWatermarkTypeImage')?.classList.contains('active');
          const txtVal = document.getElementById('watermarkTextInput')?.value || '';
          const urlVal = document.getElementById('watermarkUrlInput')?.value || '';
          const posVal = document.getElementById('watermarkPositionSelect')?.value || 'bottom-right';
          const opVal = Number(document.getElementById('watermarkOpacityRange')?.value || 0.8);
          const scVal = Number(document.getElementById('watermarkScaleRange')?.value || 1.0);

          this.setWatermark({
            enabled: isEnabled,
            text: isImageMode ? '' : txtVal,
            imageUrl: isImageMode ? urlVal : '',
            position: posVal,
            opacity: opVal,
            scale: scVal
          }, true);

          this.closeWatermarkModal();
        });
      }

      const btnClearWatermark = document.getElementById('btnClearWatermark');
      if (btnClearWatermark) {
        btnClearWatermark.addEventListener('click', () => {
          if (!this.guardPro('watermark')) return;
          this.setWatermark({ enabled: false }, true);
          const chk = document.getElementById('watermarkEnabled');
          if (chk) {
            chk.checked = false;
            this.updateWatermarkToggleBadge(false);
          }
          this.closeWatermarkModal();
        });
      }

      // Wire Banner Modal Controls
      let selectedDuration = 0;
      const durationButtons = document.querySelectorAll('.btn-duration');
      durationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          durationButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedDuration = Number(btn.dataset.duration || 0);
        });
      });

      // Target Screen selector synchronization
      const bannerTargetSelect = document.getElementById('bannerTargetSelect');
      const selStreamDeckTarget = document.getElementById('selStreamDeckTarget');

      if (bannerTargetSelect) {
        bannerTargetSelect.addEventListener('change', () => {
          const val = bannerTargetSelect.value;
          this.bannerState.target = val;
          if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(STORAGE_KEY_BANNER_TARGET, val); } catch (e) {}
          }
          if (selStreamDeckTarget) selStreamDeckTarget.value = val;
          this.updateBannerModalStatus();
        });
      }

      if (selStreamDeckTarget) {
        selStreamDeckTarget.addEventListener('change', () => {
          const val = selStreamDeckTarget.value;
          this.bannerState.target = val;
          if (typeof localStorage !== 'undefined') {
            try { localStorage.setItem(STORAGE_KEY_BANNER_TARGET, val); } catch (e) {}
          }
          if (bannerTargetSelect) bannerTargetSelect.value = val;
          this.updateBannerModalStatus();
        });
      }

      const presetButtons = document.querySelectorAll('.btn-preset-banner');
      const bannerMsgInput = document.getElementById('bannerMessageInput');
      presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          if (bannerMsgInput && btn.dataset.msg) {
            bannerMsgInput.value = btn.dataset.msg;
          }
        });
      });

      const btnBroadcastBanner = document.getElementById('btnBroadcastBanner');
      if (btnBroadcastBanner) {
        btnBroadcastBanner.addEventListener('click', () => {
          if (!this.guardPro('banner')) return;
          const msg = bannerMsgInput ? bannerMsgInput.value.trim() : '';
          if (!msg) {
            alert('Please enter a banner message to broadcast.');
            return;
          }
          const target = bannerTargetSelect ? bannerTargetSelect.value : (this.bannerState.target || 'presenter');
          this.showBanner(msg, selectedDuration, target);
          this.closeAudienceBannerModal();
        });
      }

      const btnDismissBanner = document.getElementById('btnDismissBanner');
      if (btnDismissBanner) {
        btnDismissBanner.addEventListener('click', () => {
          if (!this.guardPro('banner')) return;
          const target = bannerTargetSelect ? bannerTargetSelect.value : (this.bannerState.target || 'all');
          this.hideBanner(target);
        });
      }

      // Auto-broadcast stored watermark on init if enabled
      if (this.watermarkState.enabled) {
        setTimeout(() => {
          this.broadcastWatermark();
        }, 500);
      }
    }
  }

  const engineInstance = new WatermarkBannerEngine();

  if (typeof window !== 'undefined') {
    window.WatermarkBannerEngine = engineInstance;
    window.WatermarkBannerEngineClass = WatermarkBannerEngine;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => engineInstance.init());
    } else {
      engineInstance.init();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engineInstance;
    module.exports.WatermarkBannerEngine = WatermarkBannerEngine;
  }
})(typeof window !== 'undefined' ? window : global);
